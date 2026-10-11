// Tiny demo project for Clone IDE
function fibonacci(n) {
  if (n < 2) return n;
  return fibonacci(n - 1) + fibonacci(n - 2);
}

function average(numbers) {
  let total = 0;
  for (const n of numbers) total += n;
  return total / numbers.length;
}

module.exports = { fibonacci, average };
