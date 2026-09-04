/**
 * ゲーム開始時ドラフトフェーズ制御モジュール (public/draft.js)
 * 初期得点選択UI生成、バッティング抽選敗北時の再選択、全プレイヤー選択状況表示
 */

(function (window) {
    'use strict';

    let selectedMyChoice = null;

    /**
     * ドラフト選択肢ボタンのカラー・ラベル定義
     */
    function getScoreButtonConfig(score) {
        if (score === 5000) {
            return { label: '+5,000点', bg: '#f39c12', color: '#fff' };
        } else if (score === 1000) {
            return { label: '+1,000点', bg: '#27ae60', color: '#fff' };
        } else if (score === -1000) {
            return { label: '-1,000点', bg: '#e67e22', color: '#fff' };
        } else {
            return { label: '-5,000点', bg: '#c0392b', color: '#fff' };
        }
    }

    /**
     * ドラフト画面の描画
     * @param {Object} data { availableScores, players, choices, isConflict }
     * @param {string} myId 自身のソケットID
     */
    function renderDraftArea(data, myId) {
        const draftArea = document.getElementById('draft-area');
        const lobbyArea = document.getElementById('lobby-area');
        if (!draftArea) return;

        if (lobbyArea) lobbyArea.style.display = 'none';
        draftArea.style.display = 'block';

        const availableScores = data.availableScores || [5000, 1000, -1000, -5000];
        const players = data.players || {};
        const choices = data.choices || {};
        const isConflict = !!data.isConflict;

        const myPlayer = players[myId];
        const isMyResolved = myPlayer && myPlayer.draftResolved;
        const hasSelected = !isMyResolved && (selectedMyChoice !== null || choices[myId] !== undefined);

        // 各プレイヤーの選択状況インジケーターHTML
        let statusListHtml = '';
        Object.values(players).forEach(p => {
            const isResolved = p.draftResolved;
            const isChosen = choices[p.id] !== undefined;

            let statusBadge = '';
            if (isResolved) {
                const diff = p.score - 25000;
                const signStr = diff > 0 ? `+${diff.toLocaleString()}` : (diff < 0 ? `${diff.toLocaleString()}` : '±0');
                statusBadge = `<span style="color:#2ecc71; font-weight:bold;">[確定: ${signStr}点]</span>`;
            } else if (isChosen) {
                statusBadge = `<span style="color:#38bdf8; font-weight:bold;">[選択済み]</span>`;
            } else {
                statusBadge = `<span style="color:#94a3b8;">[選択中...]</span>`;
            }

            statusListHtml += `
                <div style="display:flex; justify-content:space-between; align-items:center; background:#1e293b; padding:6px 12px; border-radius:6px; font-size:0.9em;">
                    <span><b>${p.name}</b> ${p.id === myId ? '(あなた)' : ''}</span>
                    ${statusBadge}
                </div>
            `;
        });

        // 選択ボタン群・メッセージの生成
        let buttonsHtml = '';
        if (isMyResolved) {
            const diff = myPlayer.score - 25000;
            const signStr = diff > 0 ? `+${diff.toLocaleString()}` : (diff < 0 ? `${diff.toLocaleString()}` : '±0');
            buttonsHtml = `
                <div style="background:#1e293b; border:1.5px solid #27ae60; padding:14px; border-radius:8px; margin:15px 0; text-align:center;">
                    <div style="color:#2ecc71; font-size:1.15em; font-weight:bold;">🎉 あなたの初期得点は【${signStr}点】で確定しました！</div>
                    <div style="font-size:0.85em; color:#94a3b8; margin-top:5px;">他のプレイヤーのドラフト完了を待っています...</div>
                </div>
            `;
        } else if (hasSelected) {
            const chosenVal = choices[myId] !== undefined ? choices[myId] : selectedMyChoice;
            const conf = getScoreButtonConfig(chosenVal);
            buttonsHtml = `
                <div style="margin:15px 0; text-align:center;">
                    <div style="font-size:0.95em; color:#cbd5e1; margin-bottom:8px;">あなたの選択:</div>
                    <span style="display:inline-block; background:${conf.bg}; color:${conf.color}; padding:10px 24px; border-radius:8px; font-size:1.25em; font-weight:900;">${conf.label}</span>
                    <div style="font-size:0.85em; color:#38bdf8; margin-top:10px; font-weight:bold;">他のプレイヤーの選択を待っています...</div>
                </div>
            `;
        } else {
            let btns = '';
            availableScores.forEach(score => {
                const conf = getScoreButtonConfig(score);
                btns += `
                    <button class="btn" style="background:${conf.bg}; color:${conf.color}; font-size:1.15em; font-weight:bold; padding:12px 22px; border-radius:6px; min-width:110px;" onclick="window.DraftManager.selectScore(${score})">
                        ${conf.label}
                    </button>
                `;
            });

            const promptText = isConflict
                ? '<span style="color:#e74c3c; font-weight:bold;">⚠️ 抽選の結果、他のプレイヤーが獲得しました。残りの得点から再選択してください：</span>'
                : '希望する初期得点を1つ選択してください（重複時はランダム抽選で勝者が決定されます）：';

            buttonsHtml = `
                <div style="font-size:0.95em; color:#cbd5e1; margin-bottom:12px; text-align:center;">${promptText}</div>
                <div style="display:flex; gap:12px; justify-content:center; flex-wrap:wrap; margin:15px 0;">
                    ${btns}
                </div>
            `;
        }

        draftArea.innerHTML = `
            <h3 style="margin-top:0; color:#f1c40f; border-bottom:1px solid #475569; padding-bottom:8px; text-align:center;">
                🎲 初期得点ドラフトフェーズ
            </h3>
            <p style="font-size:0.88em; color:#94a3b8; text-align:center; margin-bottom:15px;">
                初期持ち点 25,000 点に、獲得したドラフト得点が加減算されてゲームが開始されます。
            </p>
            <div style="max-width:440px; margin:0 auto;">
                ${buttonsHtml}
                <div style="margin-top:20px; border-top:1px solid #334155; padding-top:12px;">
                    <div style="font-size:0.85em; font-weight:bold; color:#cbd5e1; margin-bottom:8px;">全プレイヤーの選択状況:</div>
                    <div style="display:flex; flex-direction:column; gap:6px;">
                        ${statusListHtml}
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * 得点選択ボタン押下処理
     */
    function selectScore(score) {
        selectedMyChoice = score;
        if (window.socket) {
            window.socket.emit('selectDraftScore', score);
        }
    }

    /**
     * バッティング競合発生時の再選択表示
     */
    function handleDraftConflict(data, myId) {
        selectedMyChoice = null; // 敗北した未解決プレイヤーの選択をリセット
        renderDraftArea({
            availableScores: data.availableScores,
            players: data.players,
            choices: {},
            isConflict: true
        }, myId);
    }

    /**
     * 誰かが選択した際の状況同期
     */
    function updateDraftChoices(choices, myId) {
        if (!window.latestGameState || !window.latestGameState.players) return;
        renderDraftArea({
            availableScores: window.latestGameState.draft ? window.latestGameState.draft.availableScores : [5000, 1000, -1000, -5000],
            players: window.latestGameState.players,
            choices: choices
        }, myId);
    }

    function closeDraftArea() {
        const draftArea = document.getElementById('draft-area');
        if (draftArea) {
            draftArea.style.display = 'none';
            draftArea.innerHTML = '';
        }
        selectedMyChoice = null;
    }

    // グローバル公開
    window.DraftManager = {
        render: renderDraftArea,
        selectScore: selectScore,
        handleConflict: handleDraftConflict,
        updateChoices: updateDraftChoices,
        close: closeDraftArea
    };

})(window);