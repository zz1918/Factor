function gcd(a, b) {
    while (b !== 0n) {
        const remainder = a % b;
        a = b;
        b = remainder;
    }
    return a;
}

function modularPower(base, exponent, modulus) {
    let result = 1n;
    base %= modulus;
    while (exponent > 0n) {
        if (exponent % 2n === 1n) result = (result * base) % modulus;
        base = (base * base) % modulus;
        exponent /= 2n;
    }
    return result;
}

function isPrime(n) {
    if (n < 2n) return false;
    for (const prime of [2n, 3n, 5n, 7n, 11n, 13n, 17n, 19n, 23n, 29n, 31n, 37n]) {
        if (n === prime) return true;
        if (n % prime === 0n) return false;
    }

    let exponent = n - 1n;
    let powersOfTwo = 0;
    while (exponent % 2n === 0n) {
        exponent /= 2n;
        powersOfTwo++;
    }

    for (const base of [2n, 325n, 9375n, 28178n, 450775n, 9780504n, 1795265022n]) {
        if (base % n === 0n) continue;
        let value = modularPower(base, exponent, n);
        if (value === 1n || value === n - 1n) continue;
        let witnessFound = true;
        for (let r = 1; r < powersOfTwo; r++) {
            value = (value * value) % n;
            if (value === n - 1n) {
                witnessFound = false;
                break;
            }
        }
        if (witnessFound) return false;
    }
    return true;
}

function pollardRho(n) {
    if (n % 2n === 0n) return 2n;
    if (n % 3n === 0n) return 3n;

    for (let attempt = 1n; ; attempt++) {
        const constant = (attempt * attempt + 1n) % n;
        let x = (attempt * 2n + 1n) % n;
        let y = x;
        let divisor = 1n;

        while (divisor === 1n) {
            x = (x * x + constant) % n;
            y = (y * y + constant) % n;
            y = (y * y + constant) % n;
            divisor = gcd(x > y ? x - y : y - x, n);
        }
        if (divisor !== n) return divisor;
    }
}

function factorInteger(n, factors = []) {
    if (n === 1n) return factors;
    if (isPrime(n)) {
        factors.push(n);
        return factors;
    }
    const divisor = pollardRho(n);
    factorInteger(divisor, factors);
    factorInteger(n / divisor, factors);
    return factors;
}

/**
 * Returns all proper positive factors of n, excluding n itself.
 * BigInt is used so values through 2^64 remain exact.
 */
function getProperFactors(n) {
    n = BigInt(n);
    if (n <= 1n) return [];

    const primeFactors = factorInteger(n).sort((a, b) => (a < b ? -1 : 1));
    const factorCounts = [];
    for (const prime of primeFactors) {
        const last = factorCounts[factorCounts.length - 1];
        if (last && last.prime === prime) last.exponent++;
        else factorCounts.push({ prime: prime, exponent: 1 });
    }

    const factors = [1n];
    for (const entry of factorCounts) {
        const baseFactors = factors.slice();
        let power = 1n;
        for (let exponent = 1; exponent <= entry.exponent; exponent++) {
            power *= entry.prime;
            baseFactors.forEach(factor => factors.push(factor * power));
        }
    }

    return factors.filter(factor => factor < n).sort((a, b) => (a < b ? -1 : 1));
}

function getAvailableMoves(n, startingNumber = n) {
    n = BigInt(n);
    const initialNumber = BigInt(startingNumber);

    const factors = getProperFactors(n).filter(factor => n % factor === 0n && (factor !== 1n || isPrime(n)));

    const moves = factors.map(factor => ({ type: 'factor', value: factor }));
    const multiplyAddResult = n * 3n + 1n;
    if (n % 2n === 1n && !isPrime(n) && multiplyAddResult <= initialNumber) {
        moves.push({ type: 'multiplyAdd', value: multiplyAddResult });
    }

    // Sample from factors and the special move together, with a maximum of three total choices.
    for (let i = moves.length - 1; i > 0; i--) {
        const randomIndex = Math.floor(Math.random() * (i + 1));
        [moves[i], moves[randomIndex]] = [moves[randomIndex], moves[i]];
    }

    return moves.slice(0, 3);
}

// Allow the Node.js AI trainer (train/) to reuse the exact same move-generation
// logic as the browser game, without affecting browser <script> loading.
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { gcd, modularPower, isPrime, pollardRho, factorInteger, getProperFactors, getAvailableMoves };
}
