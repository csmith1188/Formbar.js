// How much wood could a wood chuck chuck if a wood chuck could chuck wood?
function simulateWoodchuck({
    hoursPerDay = 8,
    daysPerWeek = 5,
    weeks = 52,
    kgPerMinute = 0.25,
    efficiency = 0.75
} = {}) {
    const minutesPerDay = hoursPerDay * 60;

    const productiveMinutes =
        minutesPerDay * efficiency;

    const dailyWood =
        productiveMinutes * kgPerMinute;

    const weeklyWood =
        dailyWood * daysPerWeek;

    const totalWood =
        weeklyWood * weeks;

    return {
        daily: dailyWood,
        weekly: weeklyWood,
        annual: totalWood,
        metricTonnes: totalWood / 1000
    };
}

module.exports = {
    simulateWoodchuck
}