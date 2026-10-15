// The original unsafe-behavior reproductions are now covered by safety assertions.
const { spawnSync } = require('node:child_process')
const path = require('node:path')
const files = require('node:fs').readdirSync(path.resolve(__dirname, '../tests')).filter(name => name.endsWith('.test.cjs')).map(name => `tests/${name}`)
let result = spawnSync(process.execPath, ['--test', ...files], { cwd: path.resolve(__dirname, '..'), stdio: 'inherit' })
if (result.status !== 0) process.exit(result.status || 1)
result = spawnSync(process.execPath, ['tests/integration.cjs'], { cwd: path.resolve(__dirname, '..'), stdio: 'inherit' })
process.exitCode = result.status || (result.error ? 1 : 0)
