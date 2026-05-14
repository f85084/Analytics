const yahooFinance = require('yahoo-finance2').default;
async function main() {
    try {
        const results = await yahooFinance.historical('2330.TW', {
            period1: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
            interval: '1d'
        });
        console.log('Success: ' + results.length);
    } catch (e) {
        console.error(e.message);
    }
}
main();