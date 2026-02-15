function waitForEvent(
    event: string,
    { resolveOnError = false, timeout = 1000 * 8 }: { resolveOnError?: boolean; timeout?: number } = {},
) {
    return new Promise((res, rej) => {
        const timeoutId = setTimeout(() => {
            window.removeEventListener(event, handleMessage)

            if (resolveOnError) {
                res(null)
            } else {
                rej(new Error(`Event ${event} not received`))
            }
        }, timeout)

        const handleMessage = () => {
            clearTimeout(timeoutId)

            window.removeEventListener(event, handleMessage)

            res(null)
        }

        window.addEventListener(event, handleMessage)
    })
}

export { waitForEvent }
