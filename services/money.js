// Work in integer cents; reject partial parses, NaN and excess precision.
function cents(value, { positive = false } = {}) {
  if (!/^-?\d+(?:\.\d{1,2})?$/.test(String(value))) throw new Error('Nominal tidak valid.')
  const result = Math.round(Number(value) * 100)
  if (!Number.isSafeInteger(result) || Math.abs(result) > 9999999999 || (positive && result <= 0)) throw new Error('Nominal di luar batas.')
  return result
}
const decimal = value => (value / 100).toFixed(2)
module.exports = { cents, decimal }
