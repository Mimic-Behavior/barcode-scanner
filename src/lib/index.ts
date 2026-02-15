import {
    type Context,
    createBarcodeScanner,
    type DecodeFailureHandler,
    type DecodeSuccessHandler,
    type Lifecycle,
    type LifecycleHook,
    type Options,
    type State,
} from './create-barcode-scanner'

export * from './constants'
export * from './create-worker'
export * from './utils'
export type { Context, DecodeFailureHandler, DecodeSuccessHandler, Lifecycle, LifecycleHook, Options, State }
export { createBarcodeScanner }
export default createBarcodeScanner
