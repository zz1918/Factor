/*
 * AI strategy registry.
 *
 * Future trained strategies can be added here without changing game turn
 * handling. A strategy receives the current number and its available factors.
 */
const AI_STRATEGIES = {
    random: {
        name: 'Random Strategy',
        description: 'Chooses any available factor at random.',
        choose: function(factors) {
            return factors[Math.floor(Math.random() * factors.length)];
        }
    },
    smallest: {
        name: 'Smallest Factor',
        description: 'Always chooses the smallest available factor.',
        choose: function(factors) {
            return factors[0];
        }
    },
    largest: {
        name: 'Largest Factor',
        description: 'Always chooses the largest available factor.',
        choose: function(factors) {
            return factors[factors.length - 1];
        }
    },
    trained: {
        name: 'Trained Strategy (Coming Soon)',
        description: 'Reserved for a strategy trained in the ai folder.',
        choose: function(factors) {
            return factors[Math.floor(Math.random() * factors.length)];
        }
    }
};

function getAiStrategy(type) {
    return AI_STRATEGIES[type] || AI_STRATEGIES.random;
}

function chooseAiFactor(type, factors) {
    if (!factors.length) return null;
    return getAiStrategy(type).choose(factors);
}
