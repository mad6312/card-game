/**
 * 防御カード手札自動セット＆自動防御モジュール (battle/auto_defense.js)
 * 手札所持時の自動セット、格上攻撃時の上書き破棄、防御カード消費処理を一括管理
 */

const { isDefenseBlocked } = require('./common');

// 格上攻撃も防げるカード（4種）の優先順位
const HIGHER_ATTACK_DEFENSE_PRIORITY = [
    'wood_shield',
    'bronze_shield',
    'wood_shield_set',
    'bronze_shield_set'
];

// 同点・格下攻撃時に防げるカード（全7種）の優先順位
const NORMAL_ATTACK_DEFENSE_PRIORITY = [
    'wood_sword',
    'wood_sword_set',
    'wood_shield',
    'bronze_shield',
    'wood_shield_set',
    'bronze_shield_set',
    'grenade'
];

/**
 * 手札から最適な防御カードを検索して取得（インデックスとカードオブジェクト）
 * @param {Object} target 防御側プレイヤー
 * @param {Object} attacker 攻撃側プレイヤー
 * @returns {{ index: number, card: Object } | null}
 */
function findBestDefenseCardInHand(target, attacker) {
    if (!target.hand || target.hand.length === 0) return null;

    const isAttackerHigher = attacker.score > target.score;
    const priorityList = isAttackerHigher
        ? HIGHER_ATTACK_DEFENSE_PRIORITY
        : NORMAL_ATTACK_DEFENSE_PRIORITY;

    for (const cardId of priorityList) {
        const idx = target.hand.findIndex(c => c.id === cardId);
        if (idx !== -1) {
            return { index: idx, card: target.hand[idx] };
        }
    }
    return null;
}

/**
 * 防御カードの自動セットおよび自動防御判定・実行
 * @param {Object} gameState ゲーム状態
 * @param {Object} target 防御側プレイヤー
 * @param {Object} attacker 攻撃側プレイヤー
 * @param {Object} options オプション { onGrenadeCounter: Function, broadcastGameState: Function }
 * @returns {Object} 判定結果
 *   - blocked: boolean (防御が成立したか)
 *   - defCard: Object (防御に使用されたカードオブジェクト)
 *   - defImg: string (カットイン表示用の防御カード画像パス)
 *   - defMsg: string (ログ追記メッセージ)
 *   - isAutoSet: boolean (手札から新規に自動セットされたか)
 *   - isOverwritten: boolean (既存カードを上書き破棄したか)
 *   - overwrittenCardName: string (破棄された旧カード名)
 *   - counterTriggered: boolean (グレネードカウンターが誘発したか)
 */
function tryAutoSetAndBlockDefense(gameState, target, attacker, options = {}) {
    const isAttackerHigher = attacker.score > target.score;
    const onGrenadeCounter = options.onGrenadeCounter || (() => { });

    let isOverwritten = false;
    let overwrittenCardName = '';
    let isAutoSet = false;

    // ----------------------------------------------------
    // 1. 既に防御カードがセットされている場合の判定
    // ----------------------------------------------------
    if (target.defenseCard) {
        // A. 既存の防御カードで防げる場合（格上ブロック制限に引っかからない）
        if (!isDefenseBlocked(target, attacker)) {
            const defObj = target.defenseCard;
            const card = defObj.card;
            defObj.usesLeft -= 1;
            defObj.revealed = true; // 公開

            const defImg = card.image || '/images/wood_shield.png';
            let msg = `しかし相手のセット中防御カード「${card.name}」で無効化されました！`;
            let counterTriggered = false;

            if (card.id === 'grenade') {
                counterTriggered = true;
                onGrenadeCounter(gameState, target.id);
            }

            if (defObj.usesLeft <= 0) {
                target.defenseCard = null;
                msg += '（相手の防御カード破棄）';
            }

            return {
                blocked: true,
                defCard: card,
                defImg: defImg,
                defMsg: msg,
                isAutoSet: false,
                isOverwritten: false,
                overwrittenCardName: '',
                counterTriggered: counterTriggered
            };
        }

        // B. 既存のカードが格上攻撃を防げない場合（木の剣/グレネード等）
        // 手札に格上も防げるカード（木の盾、青銅の盾など）があるか探索
        const candidate = findBestDefenseCardInHand(target, attacker);
        if (candidate) {
            // 上位カードによる上書き破棄を実行
            overwrittenCardName = target.defenseCard.card.name;
            target.defenseCard = null;
            isOverwritten = true;

            const handCard = target.hand.splice(candidate.index, 1)[0];
            let initialUses = 1;
            if (handCard.id === 'wood_shield_set' || handCard.id === 'bronze_shield_set') {
                initialUses = handCard.usesLeft || 3;
            }

            target.defenseCard = {
                card: handCard,
                usesLeft: initialUses,
                revealed: true
            };
            isAutoSet = true;
        } else {
            // 手札にも格上を防げるカードがない場合は防御不可（貫通）
            return { blocked: false };
        }
    }

    // ----------------------------------------------------
    // 2. 防御カードが未セット（または上書き直後）の場合の手札自動セット
    // ----------------------------------------------------
    if (!target.defenseCard) {
        const candidate = findBestDefenseCardInHand(target, attacker);
        if (!candidate) {
            return { blocked: false };
        }

        const handCard = target.hand.splice(candidate.index, 1)[0];
        let initialUses = 1;
        if (['wood_shield_set', 'bronze_shield_set', 'wood_sword_set'].includes(handCard.id)) {
            initialUses = handCard.usesLeft || 3;
        }

        target.defenseCard = {
            card: handCard,
            usesLeft: initialUses,
            revealed: true
        };
        isAutoSet = true;
    }

    // ----------------------------------------------------
    // 3. 自動セットされた防御カードでの防御実行
    // ----------------------------------------------------
    const defObj = target.defenseCard;
    const card = defObj.card;
    defObj.usesLeft -= 1;
    defObj.revealed = true;

    const defImg = card.image || '/images/wood_shield.png';
    let overwriteNotice = isOverwritten ? `(※セット中「${overwrittenCardName}」を破棄して手札から「${card.name}」を自動セット！)` : `(※手札から「${card.name}」が自動セットされました！)`;
    let msg = `しかし${target.name}の「${card.name}」で攻撃が無効化されました！ ${overwriteNotice}`;
    let counterTriggered = false;

    if (card.id === 'grenade') {
        counterTriggered = true;
        onGrenadeCounter(gameState, target.id);
    }

    if (defObj.usesLeft <= 0) {
        target.defenseCard = null;
        msg += '（防御カード破棄）';
    }

    return {
        blocked: true,
        defCard: card,
        defImg: defImg,
        defMsg: msg,
        isAutoSet: isAutoSet,
        isOverwritten: isOverwritten,
        overwrittenCardName: overwrittenCardName,
        counterTriggered: counterTriggered
    };
}

module.exports = {
    findBestDefenseCardInHand,
    tryAutoSetAndBlockDefense
};