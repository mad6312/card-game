/**
 * 戦闘モジュール統合エントリーポイント (battle/index.js)
 * server.js からは require('./battle') でそのまま利用可能です。
 */

const common = require('./common');
const triggers = require('./triggers');
const autoDefense = require('./auto_defense');
const attacksShield = require('./attacks_shield');
const attacksSword = require('./attacks_sword');
const attacksGun = require('./attacks_gun');
const specials = require('./specials');

module.exports = {
    // 1. 共通ユーティリティ (common.js)
    resetScoreChanges: common.resetScoreChanges,
    applyScoreChange: common.applyScoreChange,
    isDefenseBlocked: common.isDefenseBlocked,
    getWoodShieldHitRate: common.getWoodShieldHitRate,
    getBronzeShieldLowerHitRate: common.getBronzeShieldLowerHitRate,

    // 2. 緊急自動発動（カウンター防御） (triggers.js)
    tryAutoTriggerDefense: triggers.tryAutoTriggerDefense,

    // 3. 防御カード手札自動セット＆自動防御 (auto_defense.js)
    findBestDefenseCardInHand: autoDefense.findBestDefenseCardInHand,
    tryAutoSetAndBlockDefense: autoDefense.tryAutoSetAndBlockDefense,

    // 4. 盾系攻撃カード (attacks_shield.js)
    executeBronzeShieldClosestAttack: attacksShield.executeBronzeShieldClosestAttack,
    executeBronzeShieldGroupAttack: attacksShield.executeBronzeShieldGroupAttack,
    executeBronzeShieldSetAttack: attacksShield.executeBronzeShieldSetAttack,
    executeBronzeShieldSetGroupAttack: attacksShield.executeBronzeShieldSetGroupAttack,
    executeWoodShieldGroupAttack: attacksShield.executeWoodShieldGroupAttack,
    executeShieldSetGroupAttack: attacksShield.executeShieldSetGroupAttack,

    // 5. 剣系攻撃カード (attacks_sword.js)
    executeWoodSwordAttack: attacksSword.executeWoodSwordAttack,
    executeWoodSwordSetAttack: attacksSword.executeWoodSwordSetAttack,
    executeWoodSwordSetGroupAttack: attacksSword.executeWoodSwordSetGroupAttack,
    executeStandardAttack: attacksSword.executeStandardAttack,

    // 6. 銃撃・爆撃系カード (attacks_gun.js)
    executeGrenadeDefenseCounter: attacksGun.executeGrenadeDefenseCounter,
    executeGrenadeSingleAttack: attacksGun.executeGrenadeSingleAttack,
    executeGrenadeGroupAttack: attacksGun.executeGrenadeGroupAttack,
    executeShotgunAttack: attacksGun.executeShotgunAttack,

    // 7. 特殊効果・範囲攻撃・バフ解除 (specials.js)
    executeDiamondSword: specials.executeDiamondSword,
    executeEarthquake: specials.executeEarthquake,
    executeDisasterAttack: specials.executeDisasterAttack,
    executeDarkMatter: specials.executeDarkMatter,
    executeSmokeScreen: specials.executeSmokeScreen,
    handleBuffExpire: specials.handleBuffExpire
};