/**
 * 緊急自動発動（手札カウンター防御）判定モジュール (battle/triggers.js)
 * 「ステロイド」「無敵アーマー」「ダークマター」の手札自動発動ロジック
 */

const { applyScoreChange } = require('./common');

/**
 * ダメージ・ペナルティ確定直前の自動割り込み判定
 * @param {Object} gameState ゲーム状態
 * @param {Object} victim 被害者プレイヤーオブジェクト
 * @param {Object} options オプション { allowSteroid: boolean, isImmuneToRound1CardEffect: Function, broadcastGameState: Function }
 * @returns {Object|null} 発動結果 { triggered: true, cardId: string, cardName: string, stateName: string, canBlock: boolean, hadDefense: boolean, logMsg: string } または null
 */
function tryAutoTriggerDefense(gameState, victim, options = {}) {
    if (!victim || !victim.hand || victim.hand.length === 0) return null;

    // 既に無敵またはステロイド状態の場合は発動不要
    const isAlreadyInvincible = victim.invincibleTurns && victim.invincibleTurns > 0;
    const isAlreadySteroid = victim.steroidTurns && victim.steroidTurns > 0;
    if (isAlreadyInvincible || isAlreadySteroid) return null;

    const allowSteroid = options.allowSteroid !== false; // ステロイドで防げる攻撃かどうか
    const broadcastGameState = options.broadcastGameState || (() => { });
    const isImmuneToRound1 = options.isImmuneToRound1CardEffect || (() => false);

    const steroidIdx = victim.hand.findIndex(c => c.id === 'steroid');
    const armorIdx = victim.hand.findIndex(c => c.id === 'invincible_armor');
    const darkMatterIdx = victim.hand.findIndex(c => c.id === 'dark_matter');

    let chosenIdx = -1;
    let chosenCardId = '';

    if (allowSteroid) {
        // 【ケースA】ステロイド状態でも防げる通常攻撃・ペナルティ
        // 優先順: 1. ステロイド > 2. 無敵アーマー > 3. ダークマター
        if (steroidIdx !== -1) {
            chosenIdx = steroidIdx;
            chosenCardId = 'steroid';
        } else if (armorIdx !== -1) {
            chosenIdx = armorIdx;
            chosenCardId = 'invincible_armor';
        } else if (darkMatterIdx !== -1) {
            chosenIdx = darkMatterIdx;
            chosenCardId = 'dark_matter';
        }
    } else {
        // 【ケースB】ステロイド状態では防げない攻撃・ペナルティ（無敵アーマー/ダークマターペナルティ等）
        // 優先順: 1. 無敵アーマー > 2. ダークマター > 3. ステロイド (※無駄消費)
        if (armorIdx !== -1) {
            chosenIdx = armorIdx;
            chosenCardId = 'invincible_armor';
        } else if (darkMatterIdx !== -1) {
            chosenIdx = darkMatterIdx;
            chosenCardId = 'dark_matter';
        } else if (steroidIdx !== -1) {
            chosenIdx = steroidIdx;
            chosenCardId = 'steroid';
        }
    }

    if (chosenIdx === -1) return null;

    // ----------------------------------------------------
    // 【割り込み処理の実行】
    // Ⅰ. セット済み防御カードの全破棄
    // ----------------------------------------------------
    let hadDefense = !!victim.defenseCard;
    victim.defenseCard = null;

    // ----------------------------------------------------
    // Ⅱ. カードの自動使用・状態適用
    // ----------------------------------------------------
    const cardObj = victim.hand.splice(chosenIdx, 1)[0];
    let stateName = '';
    let logMsg = '';
    let canBlock = true; // この攻撃を防ぎきれるか

    if (chosenCardId === 'steroid') {
        victim.steroidTurns = 4;
        victim.steroidRevealed = true; // 公開状態
        if (victim.timeBombTurns > 0) victim.timeBombTurns = 0; // 時限爆弾消滅
        stateName = 'ステロイド！';

        if (allowSteroid) {
            canBlock = true;
            logMsg = `${victim.name} の手札から「ステロイド」が自動発動！ (防御カード全破棄＆ステロイド状態付与)`;
        } else {
            // ステロイドでは無効化できない攻撃に対する無駄消費
            canBlock = false;
            logMsg = `${victim.name} の手札から「ステロイド」が自動使用されましたが、この効果は無効化できません！ (ステロイド状態のみ付与)`;
        }
    } else if (chosenCardId === 'invincible_armor') {
        victim.invincibleTurns = 4;
        victim.invincibleSource = 'ARMOR';
        victim.armorRevealed = true; // 公開状態
        if (victim.timeBombTurns > 0) victim.timeBombTurns = 0; // 時限爆弾消滅
        stateName = '無敵！';
        canBlock = true;
        logMsg = `${victim.name} の手札から「無敵アーマー」が自動発動！ (防御カード全破棄＆無敵状態付与)`;
    } else if (chosenCardId === 'dark_matter') {
        victim.invincibleTurns = 1;
        victim.invincibleSource = 'DARK_MATTER';
        if (victim.timeBombTurns > 0) victim.timeBombTurns = 0; // 時限爆弾消滅

        const prevScore = victim.score;
        applyScoreChange(victim, 5000);
        const newScore = victim.score;

        stateName = '無敵！';
        canBlock = true;
        logMsg = `${victim.name} の手札から「ダークマター」が自動発動！ +5,000点獲得＆無敵状態付与！ (防御カード全破棄)`;

        // 同点・逆転相手への50%ペナルティ判定
        const penalizedNames = [];
        Object.values(gameState.players).forEach(opponent => {
            if (opponent.id === victim.id || isImmuneToRound1(opponent.id, victim.id)) return;

            const isConditionA = (opponent.score === prevScore);
            const isConditionB = (opponent.score > prevScore && newScore >= opponent.score);

            if (isConditionA || isConditionB) {
                const isAlreadyOpInvincible = opponent.invincibleTurns && opponent.invincibleTurns > 0;
                const isAlreadyOpImmune = opponent.immunityCount && opponent.immunityCount > 0;
                if (isAlreadyOpInvincible || isAlreadyOpImmune) return;

                // 1. まず50%の不発判定を行う（不発ならペナルティが発生しないため相手の手札温存）
                const isSuccess = Math.random() < 0.5;
                if (!isSuccess) {
                    penalizedNames.push(`${opponent.name}(不発)`);
                    return;
                }

                // 2. ペナルティ判定成立時：【割り込み】相手の手札カウンター判定（ステロイドでは無効化不可）
                const autoRes = tryAutoTriggerDefense(gameState, opponent, {
                    allowSteroid: false,
                    isImmuneToRound1CardEffect: isImmuneToRound1,
                    broadcastGameState: broadcastGameState
                });

                // 無敵アーマー・ダークマター等で完全無効化できた場合
                if (autoRes && autoRes.canBlock) {
                    penalizedNames.push(`${opponent.name}(「${autoRes.cardName}」自動発動ガード)`);
                    return;
                }

                // 3. ペナルティ効果の実行（ステロイド無駄消費またはカウンターなし）
                opponent.hand = [];
                opponent.defenseCard = null;
                applyScoreChange(opponent, -3000);
                opponent.immunityCount = 2;

                const steroidWasteNotice = (autoRes && !autoRes.canBlock) ? `(「ステロイド」自動消費・ペナルティ直撃)` : `(成功)`;
                penalizedNames.push(`${opponent.name}${steroidWasteNotice}`);
            }
        });

        if (penalizedNames.length > 0) {
            logMsg += ` ペナルティ対象: ${penalizedNames.join(', ')}`;
        }
    }

    return {
        triggered: true,
        cardId: chosenCardId,
        cardName: cardObj.name,
        stateName: stateName,
        canBlock: canBlock,
        hadDefense: hadDefense,
        logMsg: logMsg
    };
}

module.exports = {
    tryAutoTriggerDefense
};