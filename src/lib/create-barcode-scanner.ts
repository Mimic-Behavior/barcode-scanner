import type { BarcodeFormat } from 'barcode-detector/ponyfill'

import { WORKER_LOAD_FAILURE_CAUSE, WORKER_LOAD_TIMEOUT_CAUSE } from './constants'
import { createWorker } from './create-worker'
import { getCameraAccess, getScanArea as getScanAreaDefault, type ScanArea } from './utils'

type Context = {
    state: State
}

type DecodeFailureHandler = () => Promise<void> | void

type DecodeSuccessHandler = (data: string, area: ScanArea) => Promise<void> | void

type Lifecycle = {
    onBeforeCreate?: LifecycleHook
    onBeforeDecode?: LifecycleHook
    onBeforePause?: LifecycleHook
    onBeforeStart?: LifecycleHook
    onBeforeStop?: LifecycleHook
    onCreate?: LifecycleHook
    onDecode?: LifecycleHook
    onPause?: LifecycleHook
    onStart?: LifecycleHook
    onStop?: LifecycleHook
}

type LifecycleHook = (ctx: Context) => void

type Options = {
    debug?: boolean
    formats?: BarcodeFormat[]
    getScanArea?: (video: HTMLVideoElement) => ScanArea
    handleDecodeFailure?: DecodeFailureHandler
    handleDecodeSuccess?: DecodeSuccessHandler
    lifecycle?: Lifecycle
    scanRate?: number
}

type State = {
    decodeFrameTs: number
    isDecodeFrameProcessed: boolean
    isDestroyed: boolean
    isVideoActive: boolean
    isVideoPaused: boolean
    isWorkerLoadFailure: boolean
    scanArea: ScanArea
    scanRate: number
    video: HTMLVideoElement
}

async function createBarcodeScanner(
    video: HTMLVideoElement,
    {
        debug,
        formats = ['qr_code'],
        getScanArea = getScanAreaDefault,
        handleDecodeFailure,
        handleDecodeSuccess,
        lifecycle = {},
        scanRate = 24,
    }: Options = {},
) {
    if (!(video instanceof HTMLVideoElement)) {
        throw new Error('video is not a HTMLVideoElement')
    }

    if (!(handleDecodeSuccess instanceof Function)) {
        throw new Error('handleDecodeSuccess is not a function')
    }

    if (!(handleDecodeFailure instanceof Function)) {
        throw new Error('handleDecodeFailure is not a function')
    }

    const canvas = document.createElement('canvas')
    const canvasContext = canvas.getContext('2d', { willReadFrequently: true })!

    if (!canvasContext) {
        throw new Error('canvas context is not supported')
    }

    const { decode, worker } = createWorker({ formats })

    const state: State = {
        decodeFrameTs: performance.now(),
        isDecodeFrameProcessed: false,
        isDestroyed: false,
        isVideoActive: false,
        isVideoPaused: false,
        isWorkerLoadFailure: false,
        scanArea: getScanArea(video),
        scanRate,
        video,
    }
    const ctx: Context = { state }
    const requestFrame = video.requestVideoFrameCallback?.bind(video) ?? requestAnimationFrame

    state.video.autoplay = true
    state.video.disablePictureInPicture = true
    state.video.hidden = false
    state.video.muted = true
    state.video.playsInline = true

    if (lifecycle.onCreate) {
        lifecycle.onCreate(ctx)
    }

    let startCallbackProcessed = false
    document.addEventListener('barcode-scanner:beforestart', () => (startCallbackProcessed = true))
    document.addEventListener('barcode-scanner:start', () => (startCallbackProcessed = false))

    function handleDecode(
        handleDecodeSuccess: DecodeSuccessHandler,
        handleDecodeFailure: DecodeFailureHandler = () => {},
    ) {
        requestFrame(tick)

        async function tick() {
            if (state.isDestroyed || state.isVideoActive === false) {
                return
            }

            if (
                // Skip if the time since the last request frame is less than the scan rate
                performance.now() - state.decodeFrameTs < 1000 / state.scanRate ||
                // Skip if the frame is already processed
                state.isDecodeFrameProcessed ||
                // Skip if the video is not ready
                state.video.readyState <= 1
            ) {
                requestFrame(tick)
                return
            }

            state.isDecodeFrameProcessed = true

            state.scanArea = getScanArea(state.video)

            if (lifecycle.onBeforeDecode) {
                lifecycle.onBeforeDecode(ctx)
            }

            canvas.height = state.scanArea.height
            canvas.width = state.scanArea.width
            canvasContext.clearRect(0, 0, canvas.width, canvas.height)
            canvasContext.drawImage(
                state.video,
                state.scanArea.x,
                state.scanArea.y,
                state.scanArea.width,
                state.scanArea.height,
                0,
                0,
                canvas.width,
                canvas.height,
            )

            const imageData = canvasContext.getImageData(0, 0, canvas.width, canvas.height)

            if (debug) {
                window.dispatchEvent(
                    new CustomEvent('barcode-scanner:decode-frame', {
                        detail: {
                            imageData,
                        },
                    }),
                )
            }

            try {
                const data = await decode(imageData)

                if (data) {
                    const cornerPointsX = data.cornerPoints.map((p) => p.x)
                    const cornerPointsY = data.cornerPoints.map((p) => p.y)
                    const area = {
                        height: Math.max(...cornerPointsY) - Math.min(...cornerPointsY),
                        width: Math.max(...cornerPointsX) - Math.min(...cornerPointsX),
                        x: Math.min(...cornerPointsX) + state.scanArea.x,
                        y: Math.min(...cornerPointsY) + state.scanArea.y,
                    }

                    await Promise.resolve(handleDecodeSuccess(data.rawValue, area))
                } else {
                    await Promise.resolve(handleDecodeFailure())
                }
            } catch (err) {
                console.warn('Failed to decode barcode')

                if (err) {
                    console.error(err)

                    if (
                        err instanceof Error &&
                        (err.cause === WORKER_LOAD_FAILURE_CAUSE || err.cause === WORKER_LOAD_TIMEOUT_CAUSE)
                    ) {
                        state.isWorkerLoadFailure = true
                    }
                }
            } finally {
                if (lifecycle.onDecode) {
                    lifecycle.onDecode(ctx)
                }

                if (state.isWorkerLoadFailure === false) {
                    state.isDecodeFrameProcessed = false
                    state.decodeFrameTs = performance.now()

                    requestFrame(tick)
                }
            }
        }
    }

    async function destroy() {
        if (state.isDestroyed) {
            return
        }

        await stop()

        worker.terminate()

        state.isDestroyed = true
    }

    async function pause(): Promise<void> {
        if (state.isVideoActive === false || state.isVideoPaused || state.isDestroyed) {
            return
        }

        if (startCallbackProcessed) {
            await new Promise((res) => {
                const timeoutId = setTimeout(() => {
                    document.removeEventListener('barcode-scanner:start', handleMessage)

                    res(null)
                }, 1000 * 8)

                const handleMessage = () => {
                    clearTimeout(timeoutId)

                    document.removeEventListener('barcode-scanner:start', handleMessage)

                    res(null)
                }

                document.addEventListener('barcode-scanner:start', handleMessage)
            })
        }

        if (lifecycle.onBeforePause) {
            lifecycle.onBeforePause(ctx)
        }

        if (state.video.srcObject instanceof MediaStream) {
            state.video.srcObject.getTracks().forEach((track) => track.stop())
            state.video.srcObject = null
        }

        state.isVideoPaused = true

        if (lifecycle.onPause) {
            lifecycle.onPause(ctx)
        }
    }

    async function start({
        facingMode = 'environment',
        ...rest
    }: {
        facingMode?: 'environment' | 'user'
        handleDecodeFailure?: DecodeFailureHandler
        handleDecodeSuccess?: DecodeSuccessHandler
    } = {}) {
        const onDecodeSuccess = rest.handleDecodeSuccess ?? handleDecodeSuccess
        const onDecodeFailure = rest.handleDecodeFailure ?? handleDecodeFailure

        if (!onDecodeSuccess) {
            throw new Error('handleDecodeSuccess is required')
        }

        document.dispatchEvent(new CustomEvent('barcode-scanner:beforestart'))

        if (lifecycle.onBeforeStart) {
            lifecycle.onBeforeStart(ctx)
        }

        const hasAccess = await getCameraAccess()

        if (!hasAccess) {
            throw new Error('No camera access')
        }

        if (state.video.srcObject instanceof MediaStream) {
            return
        } else {
            state.video.srcObject = await navigator.mediaDevices.getUserMedia({
                video: {
                    facingMode,
                },
            })

            await state.video.play()
        }

        state.isVideoActive = true
        state.isVideoPaused = false
        state.scanArea = getScanArea(state.video)
        state.video.style.transform = facingMode === 'user' ? 'scaleX(-1)' : 'none'

        document.dispatchEvent(new CustomEvent('barcode-scanner:start'))

        if (lifecycle.onStart) {
            lifecycle.onStart(ctx)
        }

        handleDecode(onDecodeSuccess, onDecodeFailure)
    }

    async function stop() {
        if (state.isDestroyed) {
            return
        }

        if (startCallbackProcessed) {
            await new Promise((res) => {
                const timeoutId = setTimeout(() => {
                    document.removeEventListener('barcode-scanner:start', handleMessage)

                    res(null)
                }, 1000 * 8)

                const handleMessage = () => {
                    clearTimeout(timeoutId)

                    document.removeEventListener('barcode-scanner:start', handleMessage)

                    res(null)
                }

                document.addEventListener('barcode-scanner:start', handleMessage)
            })
        }

        if (lifecycle.onBeforeStop) {
            lifecycle.onBeforeStop(ctx)
        }

        if (state.video.srcObject instanceof MediaStream) {
            state.video.srcObject.getTracks().forEach((track) => track.stop())
            state.video.srcObject = null
        }

        state.isVideoActive = false
        state.isVideoPaused = false
        state.video.poster = ''

        if (lifecycle.onStop) {
            lifecycle.onStop(ctx)
        }
    }

    return {
        decode,
        destroy,
        pause,
        start,
        startCallbackProcessed,
        state,
        stop,
    }
}

export type { DecodeFailureHandler, DecodeSuccessHandler, LifecycleHook, State }
export { createBarcodeScanner }
