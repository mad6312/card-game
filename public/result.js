/**
 * リザルト画面＆勝敗遷移制御モジュール (public/result.js)
 * 2カラム統一整列、1位ゴールドスポットライト・王冠演出、再戦・退出制御
 */

(function (window) {
    'use strict';

    /**
     * リザルト画面モーダルを表示
     * @param {Array<Object>} players 最終結果プレイヤー配列
     * @param {string} myId 自身のソケットID
     * @param {Array} presetAvatars プリセットアバター一覧
     */
    function showResultModal(players, myId, presetAvatars) {
        const modal = document.getElementById('result-modal');
        const listContainer = document.getElementById('result-ranking-list');
        if (!modal || !listContainer || !players || players.length === 0) return;

        // 1. スコアの高い順にソート（同点はプレイヤー番号昇順）
        const sorted = [...players].sort((a, b) => {
            if (b.score !== a.score) return b.score - a.score;
            return a.number - b.number;
        });

        // 2. 順位マップの構築（同点順位対応）
        const rankMap = {};
        sorted.forEach((p) => {
            const higherCount = sorted.filter(other => other.score > p.score).length;
            rankMap[p.id] = higherCount + 1;
        });

        // 3. 2カラム行の構築
        let rowsHtml = '';

        sorted.forEach((p) => {
            const isMe = (p.id === myId);
            const rank = rankMap[p.id];
            const isWinner = (rank === 1);

            // アバター画像パス解決
            let avatarSrc = '/images/avatars/avatar_default.png';
            if (p.avatar && p.avatar !== 'avatar_default') {
                const matched = (presetAvatars || []).find(a => a.id === p.avatar);
                if (matched) avatarSrc = matched.image;
            }

            const rankBadgeHtml = isWinner
                ? `<span class="result-rank-badge rank-winner"><span class="result-crown-icon">👑</span> 1位</span>`
                : `<span class="result-rank-badge">${rank}位</span>`;

            const winnerTagHtml = isWinner
                ? `<span class="result-winner-tag">🏆 WINNER</span>`
                : '';

            rowsHtml += `
                <div class="result-row ${isWinner ? 'row-winner' : ''} ${isMe ? 'row-me' : ''}">
                    <!-- カラム1: プレイヤー情報（順位 + アバター + 名前全文表示） -->
                    <div class="result-col-player">
                        ${rankBadgeHtml}
                        <img src="${avatarSrc}" class="result-avatar" alt="${p.name}" onerror="this.src='/images/avatars/avatar_default.png'">
                        <span class="result-player-name" title="${p.name}">
                            ${p.name}${isMe ? ' <span style="font-size:0.85em; color:#38bdf8;">(あなた)</span>' : ''}
                        </span>
                        ${winnerTagHtml}
                    </div>

                    <!-- カラム2: 最終得点（右揃え・縦列統一） -->
                    <div class="result-col-score">
                        ${p.score.toLocaleString()}点
                    </div>
                </div>
            `;
        });

        listContainer.innerHTML = rowsHtml;
        modal.style.display = 'flex';
    }

    /**
     * リザルト画面モーダルを閉じる
     */
    function closeResultModal() {
        const modal = document.getElementById('result-modal');
        if (modal) modal.style.display = 'none';
    }

    /**
     * [再戦] ボタン押下ハンドラ
     */
    function handleRematchClick() {
        if (window.socket) {
            window.socket.emit('requestRematch');
        }
        closeResultModal();
    }

    /**
     * [退出する] ボタン押下ハンドラ
     */
    function handleLeaveLobbyClick() {
        if (window.socket) {
            window.socket.emit('leaveToLobby');
        }
        closeResultModal();
    }

    // グローバル公開
    window.ResultModal = {
        show: showResultModal,
        close: closeResultModal,
        handleRematch: handleRematchClick,
        handleLeave: handleLeaveLobbyClick
    };

})(window);