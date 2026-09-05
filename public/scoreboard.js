/**
 * スコアボードUI制御モジュール (scoreboard.js)
 * 4カラム・グリッド構造、アコーディオン開閉維持、名前・状態バッジ・持ち点・点差の縦列統一整列
 */

(function (window) {
    'use strict';

    /**
     * 各プレイヤーの現在の状態ステータスバッジ群のHTMLを生成
     * @param {Object} p プレイヤーオブジェクト
     * @param {boolean} isMe 自分自身かどうか
     * @returns {string} バッジコンテナHTML
     */
    function renderScoreboardBadges(p, isMe) {
        let badgesHtml = '';

        // 1. 選択不可状態
        if (p.immunityCount > 0) {
            badgesHtml += `
                <span class="scoreboard-badge-tag" title="選択不可">
                    不可:${p.immunityCount}
                </span>
            `;
        }

        // 2. 無敵状態（ダークマター / 無敵アーマー）
        if (p.invincibleTurns > 0) {
            if (p.invincibleSource === 'DARK_MATTER') {
                badgesHtml += `
                    <div class="status-badge-wrapper scoreboard-badge-wrapper">
                        <img src="/images/dark_matter.png" class="scoreboard-badge-img" alt="ダークマター">
                        <div class="card-tooltip">
                            <div style="font-weight: bold; color: #f1c40f; margin-bottom: 3px;">ダークマター</div>
                            <div>無敵：あらゆる攻撃カードの効果を受けない。</div>
                        </div>
                    </div>
                `;
            } else if (isMe || p.armorRevealed) {
                badgesHtml += `
                    <div class="status-badge-wrapper scoreboard-badge-wrapper">
                        <img src="/images/invincible_armor.png" class="scoreboard-badge-img" alt="無敵アーマー">
                        <span class="status-badge-count scoreboard-badge-count">${p.invincibleTurns}</span>
                        <div class="card-tooltip">
                            <div style="font-weight: bold; color: #f1c40f; margin-bottom: 3px;">無敵アーマー</div>
                            <div>無敵：あらゆる攻撃カードの効果を受けない。</div>
                        </div>
                    </div>
                `;
            }
        }

        // 3. ステロイド状態（自分自身、または公開時のみ）
        if (p.steroidTurns > 0 && (isMe || p.steroidRevealed)) {
            badgesHtml += `
                <div class="status-badge-wrapper scoreboard-badge-wrapper">
                    <img src="/images/steroid.png" class="scoreboard-badge-img" alt="ステロイド">
                    <span class="status-badge-count scoreboard-badge-count">${p.steroidTurns}</span>
                    <div class="card-tooltip">
                        <div style="font-weight: bold; color: #f1c40f; margin-bottom: 3px;">ステロイド</div>
                        <div>ステロイド：一部を除く攻撃カードの効果を受けない。</div>
                    </div>
                </div>
            `;
        }

        // 4. 暗闇状態（煙幕）
        if (p.darknessTurns > 0) {
            badgesHtml += `
                <div class="status-badge-wrapper scoreboard-badge-wrapper">
                    <img src="/images/smoke_screen.png" class="scoreboard-badge-img" alt="煙幕">
                    <span class="status-badge-count scoreboard-badge-count">${p.darknessTurns}</span>
                    <div class="card-tooltip">
                        <div style="font-weight: bold; color: #f1c40f; margin-bottom: 3px;">煙幕</div>
                        <div>暗闇：攻撃カードの命中率が半減される。</div>
                    </div>
                </div>
            `;
        }

        // 5. 時限爆弾状態
        if (p.timeBombTurns > 0) {
            badgesHtml += `
                <div class="status-badge-wrapper scoreboard-badge-wrapper">
                    <img src="/images/time_bomb.png" class="scoreboard-badge-img" alt="時限爆弾">
                    <span class="status-badge-count scoreboard-badge-count">${p.timeBombTurns}</span>
                    <div class="card-tooltip">
                        <div style="font-weight: bold; color: #e74c3c; margin-bottom: 3px;">時限爆弾</div>
                        <div>時限爆弾：カウントが0になると爆発して-6,000点＆手札防御全破棄。±3,000点差の相手に50%で受け渡し可能。</div>
                    </div>
                </div>
            `;
        }

        return `<div class="scoreboard-col-badges">${badgesHtml}</div>`;
    }

    /**
     * スコアボードの描画・更新処理（4カラム完全同期・開閉状態維持）
     * @param {Object} players プレイヤー一覧データ
     * @param {string} myId 自身のソケットID
     * @param {Array} presetAvatars プリセットアバター一覧
     */
    function updateScoreboard(players, myId, presetAvatars) {
        const container = document.getElementById('global-scoreboard');
        const listContainer = document.getElementById('scoreboard-list');
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

        // 3. 4カラムHTMLの構築
        let rowsHtml = '';

        sorted.forEach((p) => {
            const isMe = (p.id === myId);
            const rank = rankMap[p.id];

            // アバター画像パス解決
            let avatarSrc = '/images/avatars/avatar_default.png';
            if (p.avatar && p.avatar !== 'avatar_default') {
                const matched = (presetAvatars || []).find(a => a.id === p.avatar);
                if (matched) avatarSrc = matched.image;
            }

            // カラム2: 状態ステータスバッジ
            const badgesColHtml = renderScoreboardBadges(p, isMe);

            // カラム4: 得点差テキスト＆スタイルの決定
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
                    <!-- カラム1: プレイヤー情報（順位 + アバター + 名前） -->
                    <div class="scoreboard-col-player">
                        <span class="scoreboard-rank">${rank}位</span>
                        <img src="${avatarSrc}" class="scoreboard-avatar" alt="${p.name}" onerror="this.src='/images/avatars/avatar_default.png'">
                        <span class="scoreboard-name" title="${p.name}">${p.name}</span>
                    </div>

                    <!-- カラム2: 状態ステータスバッジ（左揃え） -->
                    ${badgesColHtml}

                    <!-- カラム3: 現在の得点（右揃えで縦列統一） -->
                    <div class="scoreboard-col-score">${p.score.toLocaleString()}点</div>

                    <!-- カラム4: 自分との得点差（右揃えで縦列統一） -->
                    <div class="scoreboard-col-diff">${diffHtml}</div>
                </div>
            `;
        });

        // details全体の開閉状態を維持したまま、中身のリスト部分のみを更新
        if (listContainer) {
            listContainer.innerHTML = rowsHtml;
        }
    }

    // グローバル公開
    window.Scoreboard = {
        update: updateScoreboard
    };

})(window);