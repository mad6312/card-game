/**
 * スコアボードUI制御モジュール (scoreboard.js)
 * 3カラム・グリッド構造により、名前・持ち点・点差の縦列を美しく整列描画します。
 */

(function (window) {
    'use strict';

    /**
     * スコアボードの描画・更新処理
     * @param {Object} players プレイヤー一覧データ
     * @param {string} myId 自身のソケットID
     * @param {Array} presetAvatars プリセットアバター一覧
     */
    function updateScoreboard(players, myId, presetAvatars) {
        const container = document.getElementById('global-scoreboard');
        if (!container || !players) return;

        const playerList = Object.values(players);
        if (playerList.length === 0) {
            container.style.display = 'none';
            return;
        }

        container.style.display = 'block';

        // 1. 得点の高い順にソート（同点はプレイヤー番号昇順）
        const sorted = [...playerList].sort((a, b) => {
            if (b.score !== a.score) return b.score - a.score;
            return a.number - b.number;
        });

        const myPlayer = players[myId];
        const myScore = myPlayer ? myPlayer.score : 0;

        // 2. 順位マップの構築（同点順位対応）
        const rankMap = {};
        sorted.forEach((p) => {
            const higherCount = sorted.filter(other => other.score > p.score).length;
            rankMap[p.id] = higherCount + 1;
        });

        // 3. 3カラムHTMLの構築
        let rowsHtml = '';

        sorted.forEach((p) => {
            const isMe = (p.id === myId);
            const rank = rankMap[p.id];

            // アバター画像パスの解決
            let avatarSrc = '/images/avatars/avatar_default.png';
            if (p.avatar && p.avatar !== 'avatar_default') {
                const matched = (presetAvatars || []).find(a => a.id === p.avatar);
                if (matched) avatarSrc = matched.image;
            }

            // 得点差テキスト＆スタイルの決定
            let diffHtml = '';
            if (isMe) {
                diffHtml = `<span class="score-diff-tag diff-me">(自分)</span>`;
            } else {
                const diff = p.score - myScore;
                if (diff > 0) {
                    diffHtml = `<span class="score-diff-tag diff-higher">(+${diff.toLocaleString()}点)</span>`;
                } else if (diff < 0) {
                    diffHtml = `<span class="score-diff-tag diff-lower">(${diff.toLocaleString()}点)</span>`;
                } else {
                    diffHtml = `<span class="score-diff-tag diff-equal">(±0点)</span>`;
                }
            }

            rowsHtml += `
                <div class="scoreboard-row ${isMe ? 'row-me' : ''}">
                    <!-- カラム1: プレイヤー情報（順位 + アバター + 名前最大10文字） -->
                    <div class="scoreboard-col-player">
                        <span class="scoreboard-rank">${rank}位</span>
                        <img src="${avatarSrc}" class="scoreboard-avatar" alt="${p.name}" onerror="this.src='/images/avatars/avatar_default.png'">
                        <span class="scoreboard-name" title="${p.name}">${p.name}</span>
                    </div>

                    <!-- カラム2: 現在の得点（右揃えで縦列統一） -->
                    <div class="scoreboard-col-score">${p.score.toLocaleString()}点</div>

                    <!-- カラム3: 自分との得点差（右揃えで縦列統一） -->
                    <div class="scoreboard-col-diff">${diffHtml}</div>
                </div>
            `;
        });

        container.innerHTML = `
            <div class="scoreboard-header">📊 スコアボード</div>
            <div class="scoreboard-list">${rowsHtml}</div>
        `;
    }

    // グローバル公開
    window.Scoreboard = {
        update: updateScoreboard
    };

})(window);