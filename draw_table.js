/**
 * 順位別カード排出確率テーブル＆重み付け抽選モジュール (draw_table.js)
 * プレイヤー順位（1位〜4位）に応じた排出確率、制限除外時の重み再正規化、安全フォールバックを管理
 */

// 順位別カード排出確率テーブルマスター（各順位合計100.0%）
const RANK_DRAW_TABLES = {
    // 1位：武具中心の堅実な配分 (合計 100%)
    1: {
        wood_shield: 32.5,
        wood_sword: 37.5,
        wood_sword_set: 10.0,
        shotgun: 20.0
    },
    // 2位：バランス型配分 (合計 100%)
    2: {
        wood_shield: 5.0,
        wood_shield_set: 10.0,
        bronze_shield: 17.5,
        bronze_shield_set: 7.5,
        wood_sword: 2.5,
        wood_sword_set: 5.0,
        shotgun: 2.5,
        grenade: 7.5,
        diamond_sword: 7.5,
        earthquake: 2.5,
        time_bomb: 7.5,
        omamori_koban: 15.0,
        omamori_koban_set: 2.5,
        steroid: 5.0,
        smoke_screen: 2.5
    },
    // 3位：強力カード解禁配分 (合計 100%)
    3: {
        wood_shield_set: 2.5,
        bronze_shield: 2.5,
        bronze_shield_set: 5.0,
        grenade: 2.5,
        diamond_sword: 15.0,
        earthquake: 10.0,
        time_bomb: 7.5,
        omamori_koban: 2.5,
        omamori_koban_set: 12.5,
        omamori_oban: 7.5,
        disaster: 5.0,
        invincible_armor: 7.5,
        steroid: 10.0,
        smoke_screen: 10.0
    },
    // 4位：大逆転用の超強力カード特化配分 (合計 100%)
    4: {
        diamond_sword: 5.0,
        earthquake: 5.0,
        omamori_koban_set: 17.5,
        omamori_oban: 22.5,
        disaster: 20.0,
        invincible_armor: 10.0,
        dark_matter: 17.5,
        smoke_screen: 2.5
    }
};

/**
 * 全プレイヤーのスコア状況から対象プレイヤーの順位（1〜4）を算出
 * 同点の場合は同じ順位（例: 全員25,000点なら全員1位）
 * @param {Object} player 対象プレイヤー
 * @param {Array<Object>} allPlayers 全プレイヤー配列
 * @returns {number} 順位（1, 2, 3, 4）
 */
function calculatePlayerRank(player, allPlayers) {
    if (!player || !allPlayers || allPlayers.length === 0) return 1;
    const higherCount = allPlayers.filter(other => other.score > player.score).length;
    return Math.min(Math.max(higherCount + 1, 1), 4);
}

/**
 * 制限をクリアした有効カード群の中から、順位別確率テーブルに基づいて重み付け抽選を行う
 * @param {Array<Object>} availableCards 各種制限をクリアした有効カードオブジェクトの配列
 * @param {number} rank プレイヤーの順位（1〜4）
 * @returns {Object} 抽選されたカードオブジェクト
 */
function selectCardByRankTable(availableCards, rank) {
    if (!availableCards || availableCards.length === 0) return null;

    // 候補が1枚のみの場合はそのまま返却
    if (availableCards.length === 1) return availableCards[0];

    const availableIds = availableCards.map(c => c.id);
    let targetRank = rank;
    let validWeights = [];

    // 1. 現在の順位テーブルから、有効カードに含まれるカードとその重みを抽出
    // ※もし極限状態で候補が0件になった場合は、上位順位テーブル（3 ➔ 2 ➔ 1）へフォールバック探索
    while (targetRank >= 1) {
        const table = RANK_DRAW_TABLES[targetRank] || {};
        validWeights = [];

        Object.keys(table).forEach(cardId => {
            if (availableIds.includes(cardId)) {
                validWeights.push({
                    cardId: cardId,
                    weight: table[cardId]
                });
            }
        });

        if (validWeights.length > 0) break;
        targetRank--; // 上位順位テーブルへフォールバック
    }

    // 2. 万が一全順位テーブルでもヒットしなかった場合のフォールバック（均等抽選）
    if (validWeights.length === 0) {
        return availableCards[Math.floor(Math.random() * availableCards.length)];
    }

    // 3. 残存カードの重み合計（Total Weight）を算出
    const totalWeight = validWeights.reduce((sum, item) => sum + item.weight, 0);
    if (totalWeight <= 0) {
        return availableCards[Math.floor(Math.random() * availableCards.length)];
    }

    // 4. 重み付けランダム抽選（再正規化された比率通りに抽選）
    const randomVal = Math.random() * totalWeight;
    let cumulative = 0;
    let selectedId = validWeights[0].cardId;

    for (const item of validWeights) {
        cumulative += item.weight;
        if (randomVal < cumulative) {
            selectedId = item.cardId;
            break;
        }
    }

    // 5. 決定したIDに合致するカードオブジェクトを返却
    return availableCards.find(c => c.id === selectedId) || availableCards[0];
}

module.exports = {
    RANK_DRAW_TABLES,
    calculatePlayerRank,
    selectCardByRankTable
};