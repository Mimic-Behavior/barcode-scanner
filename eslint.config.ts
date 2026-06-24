import { createConfig } from '@mimic-behavior/eslint-config'

export default createConfig({
    plugins: {
        json: true,
        perfectionist: true,
        sonarjs: true,
        typescript: true,
        yaml: true,
    },
})
