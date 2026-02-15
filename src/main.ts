import {
    createBarcodeScanner,
    type ScanArea,
    translateAreaToVideoRender,
    translateAreaToVideoSource,
    wait,
} from './lib'
import './main.css'

const video = document.querySelector<HTMLVideoElement>('[data-id="video"]')
const videoContainer = document.querySelector<HTMLDivElement>('[data-id="video-container"]')

/**
 * Get the control elements
 */
const buttonPause = document.querySelector('[data-id="button-pause"]')
const buttonStart = document.querySelector('[data-id="button-start"]')
const buttonStop = document.querySelector('[data-id="button-stop"]')
const checkboxAlertOnSuccess = document.querySelector<HTMLInputElement>('[data-id="checkbox-alert-on-success"]')
const selectObjectFit = document.querySelector('[data-id="select-object-fit"]')
const selectObjectPosition = document.querySelector('[data-id="select-object-position"]')

/**
 * Get the result elements
 */
const resultTitle = document.querySelector('[data-id="result-title"]')
const resultValue = document.querySelector('[data-id="result-value"]')

function delAreaVariable(element: HTMLElement, name: string) {
    element.style.removeProperty(`--${name}-height`)
    element.style.removeProperty(`--${name}-width`)
    element.style.removeProperty(`--${name}-x`)
    element.style.removeProperty(`--${name}-y`)
    element.style.removeProperty(`--${name}-scale`)
}

function setAreaVariable(element: HTMLElement, name: string, area: ScanArea, scale?: number) {
    element.style.setProperty(`--${name}-height`, `${area.height}px`)
    element.style.setProperty(`--${name}-width`, `${area.width}px`)
    element.style.setProperty(`--${name}-x`, `${area.x}px`)
    element.style.setProperty(`--${name}-y`, `${area.y}px`)

    if (scale) {
        element.style.setProperty(`--${name}-scale`, `${scale}`)
    }
}

if (video && videoContainer) {
    const barcodeScanner = await createBarcodeScanner(video, {
        debug: true,
        getScanArea(video) {
            const size = (2 / 3) * Math.min(video.offsetWidth, video.offsetHeight)
            const area = {
                height: size,
                width: size,
                x: (video.offsetWidth - size) / 2,
                y: (video.offsetHeight - size) / 2,
            }

            return translateAreaToVideoSource(video, area)
        },
        handleDecodeFailure() {
            if (!resultTitle || !resultValue) {
                return
            }

            delAreaVariable(video.parentElement!, 'barcode-scanner-area-detected')

            resultValue.textContent = 'No data'
        },
        async handleDecodeSuccess(data, area) {
            if (!resultTitle || !resultValue) {
                return
            }

            const scanArea = barcodeScanner.state.scanArea
            const scaleX = Math.max(1, (scanArea.width * (3 / 4)) / area.width)
            const scaleY = Math.max(1, (scanArea.height * (3 / 4)) / area.height)

            setAreaVariable(
                video.parentElement!,
                'barcode-scanner-area-detected',
                translateAreaToVideoRender(video, area),
                Math.max(scaleX, scaleY),
            )

            if (checkboxAlertOnSuccess?.checked) {
                await barcodeScanner.pause()
                await wait(400)

                alert(`Barcode decoded: ${data}`)

                await barcodeScanner.start()
            }

            resultValue.textContent = data
        },
        lifecycle: {
            onBeforeDecode({ state }) {
                setAreaVariable(
                    video.parentElement!,
                    'barcode-scanner-area',
                    translateAreaToVideoRender(video, state.scanArea),
                )
            },
            onStart({ state }) {
                setAreaVariable(
                    video.parentElement!,
                    'barcode-scanner-area',
                    translateAreaToVideoRender(video, state.scanArea),
                )
            },
        },
    })

    buttonStart?.addEventListener('click', () => {
        barcodeScanner.start({ facingMode: 'environment' })
    })
    buttonPause?.addEventListener('click', () => {
        barcodeScanner.pause()
    })
    buttonStop?.addEventListener('click', () => {
        barcodeScanner.stop()
    })
    selectObjectFit?.addEventListener('change', (event) => {
        video.style.objectFit = (event.target as HTMLSelectElement).value
    })
    selectObjectPosition?.addEventListener('change', (event) => {
        video.style.objectPosition = (event.target as HTMLSelectElement).value
    })

    /**
     * Debug video scan area
     */
    const canvas = document.createElement('canvas')
    const canvasContext = canvas.getContext('2d')

    window.addEventListener('barcode-scanner:decode-frame', (event) => {
        if (!(event instanceof CustomEvent) || !event.detail || !event.detail.imageData) {
            return
        }

        const { imageData } = event.detail as { imageData: ImageData }

        canvas.width = imageData.width
        canvas.height = imageData.height
        canvasContext?.putImageData(imageData, 0, 0)

        const img = document.querySelector<HTMLImageElement>('[data-id="video-preview"]')
        if (img) {
            img.src = canvas.toDataURL()
        } else {
            const img = document.createElement('img')
            img.classList.add('demo__video-preview')
            img.src = canvas.toDataURL()
            img.dataset.id = 'video-preview'
            videoContainer.appendChild(img)
        }
    })
}
