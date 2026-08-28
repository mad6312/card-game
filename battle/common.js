/**
 * 戦闘共通ユーティリティモジュール (battle/common.js)
 */

function resetScoreChanges(gameState) {
    Object.values(gameState.players).forEach(p => {
        p.scoreChange = 0;
    });
}

function applyScoreChange(player, amount) {
    player.prevScore = player.score;
    player.scoreChange = amount;
    player.score += amount;
}

function isDefenseBlocked(target, attacker) {
    if (!target.defenseCard) return false;
    const isRestricted = ['wood_sword', 'wood_sword_set', 'grenade'].includes(target.defenseCard.card.id);
    return isRestricted && (attacker.score > target.score);
}

function getWoodShieldHitRate(attackerScore, targetScore) {
    const diff = attackerScore - targetScore;
    const rate = Math.max(0, 1 - Math.abs(diff) / 10000);
    return rate;
}

function getBronzeShieldLowerHitRate(attackerScore, targetScore) {
    const diff = attackerScore - targetScore;
    const rate = Math.max(0, 1 - Math.abs(diff) / 5000);
    return rate;
}

module.exports = {
    resetScoreChanges,
    applyScoreChange,
    isDefenseBlocked,
    getWoodShieldHitRate,
    getBronzeShieldLowerHitRate
};