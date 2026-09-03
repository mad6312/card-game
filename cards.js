// 全19種のカード定義マスターデータ（3桁カンマ区切りテキスト対応）
const CARD_DECK = [
    {
        id: 'wood_shield',
        name: '木の盾',
        category: 'DEFENSE',
        image: '/images/wood_shield.png',
        desc: '<span style="color:#e74c3c; font-weight:bold;">【攻撃】</span>\n【対象】自分以上の得点を持つ相手全員 または 自分より得点が下の相手全員\n【効果】対象に3,000点ダメージを与える。\n【命中率】100-(得点差/100)%\n\n<span style="color:#3498db; font-weight:bold;">【防御】</span>\n【効果】一部を除く相手からの攻撃を1回無効化する。\n【所有時】一部を除く攻撃カードの対象となった時、手札のこのカードで自動的に防御を行う。'
    },
    {
        id: 'wood_shield_set',
        name: '木の盾セット',
        category: 'DEFENSE',
        image: '/images/wood_shield_set.png',
        desc: '<span style="color:#e74c3c; font-weight:bold;">【攻撃】</span>\n【対象】自分以上の得点を持つ相手全員 または 自分より得点が下の相手全員\n【効果】対象に3,000点ダメージを与える。\n【命中率】100-(得点差/100)%\n\n<span style="color:#3498db; font-weight:bold;">【防御】</span>\n【効果】一部を除く相手からの攻撃を1回無効化する。\n【所有時】一部を除く攻撃カードの対象となった時、手札のこのカードで自動的に防御を行う。\n\n【残り回数】3回'
    },
    {
        id: 'bronze_shield',
        name: '青銅の盾',
        category: 'DEFENSE',
        image: '/images/bronze_shield.png',
        desc: '<span style="color:#e74c3c; font-weight:bold;">【攻撃】</span>\n【対象】自分以上で最も点差が近い相手1名 または 自分より得点が下の相手全員\n【効果】対象に3,000点ダメージを与える。\n【命中率】\n上：100%\n下：100-(得点差/50)%\n\n<span style="color:#3498db; font-weight:bold;">【防御】</span>\n【効果】一部を除く相手からの攻撃を1回無効化する。\n【所有時】一部を除く攻撃カードの対象となった時、手札のこのカードで自動的に防御を行う。'
    },
    {
        id: 'bronze_shield_set',
        name: '青銅の盾セット',
        category: 'DEFENSE',
        image: '/images/bronze_shield_set.png',
        desc: '<span style="color:#e74c3c; font-weight:bold;">【攻撃】</span>\n【対象】自分以上で最も点差が近い相手1名 または 自分より得点が下の相手全員\n【効果】対象に3,000点ダメージを与える。\n【命中率】\n上：100%\n下：100-(得点差/50)%\n\n<span style="color:#3498db; font-weight:bold;">【防御】</span>\n【効果】一部を除く相手からの攻撃を1回無効化する。\n【所有時】一部を除く攻撃カードの対象となった時、手札のこのカードで自動的に防御を行う。\n\n【残り回数】3回'
    },
    {
        id: 'wood_sword',
        name: '木の剣',
        category: 'ATTACK',
        image: '/images/wood_sword.png',
        desc: '<span style="color:#e74c3c; font-weight:bold;">【攻撃】</span>\n【対象】自分との得点差が+5,000点以内の相手1人 または 自分より得点が下の相手全員\n【効果】対象に3,000点ダメージを与える。\n【命中率】50%\n\n<span style="color:#3498db; font-weight:bold;">【防御】</span>\n【効果】一部を除く相手からの攻撃を1回無効化する。ただし、自分より得点が高い相手からの攻撃を無効化することはできない。\n【所有時】一部を除く攻撃カードの対象となった時、手札のこのカードで自動的に防御を行う。'
    },
    {
        id: 'wood_sword_set',
        name: '木の剣セット',
        category: 'ATTACK',
        image: '/images/wood_sword_set.png',
        desc: '<span style="color:#e74c3c; font-weight:bold;">【攻撃】</span>\n【対象】自分との得点差が+5,000点以内の相手1人 または 自分より得点が下の相手全員\n【効果】対象に3,000点ダメージを与える。\n【命中率】50%\n\n<span style="color:#3498db; font-weight:bold;">【防御】</span>\n【効果】一部を除く相手からの攻撃を1回無効化する。ただし、自分より得点が高い相手からの攻撃を無効化することはできない。\n【所有時】一部を除く攻撃カードの対象となった時、手札のこのカードで自動的に防御を行う。\n\n【残り回数】3回'
    },
    {
        id: 'shotgun',
        name: 'ショットガン',
        category: 'ATTACK',
        image: '/images/shotgun.png',
        desc: '<span style="color:#e74c3c; font-weight:bold;">【攻撃】</span>\n【対象】自分との得点差が+5,000点以内の相手1人 または 自分より得点が下の相手全員\n【効果】対象に3,000点ダメージを与える。このカードによる攻撃は防御カードを貫通する。\n【命中率】50%'
    },
    {
        id: 'grenade',
        name: 'グレネード',
        category: 'ATTACK',
        image: '/images/grenade.png',
        desc: '<span style="color:#e74c3c; font-weight:bold;">【攻撃】</span>\n【対象】自分との得点差が+5,000点以内の相手1人 または 自分との得点差が-5,000点以内の相手全員\n【追加対象】上記対象との得点差が1,000点以内のプレイヤー（自分も含む）\n【効果】対象の手札・防御カードをすべて捨て、さらに5,000点ダメージを与える。このカードによる攻撃は防御カードを貫通する。\n【命中率】\n上：50%\n下：80%\n\n<span style="color:#3498db; font-weight:bold;">【防御】</span>\n【効果】一部を除く相手からの攻撃を1回無効化する。ただし、自分より得点が高い相手からの攻撃を無効化することはできない。\n【追加効果】無効化時、自分との得点差が-1,000点以内の相手全員の手札・防御カードをすべて破棄し、さらに5,000点ダメージを与える。\n【所有時】一部を除く攻撃カードの対象となった時、手札のこのカードで自動的に防御を行う。'
    },
    {
        id: 'diamond_sword',
        name: 'ダイヤの剣',
        category: 'ATTACK',
        image: '/images/diamond_sword.png',
        desc: '【対象】1位、および1位と得点差が±1,000点以内のプレイヤー全員（自分も含む）\n【効果】対象の手札・防御カードをすべて捨て、5,000点ダメージを与える。'
    },
    {
        id: 'earthquake',
        name: '地震',
        category: 'ATTACK',
        image: '/images/earthquake.png',
        desc: '【使用時】自分と同点以上の相手全員に1,000点/3,000点(各50%)ダメージを与える。\n【追加効果】対象の手札・防御カードをすべて破棄する。'
    },
    {
        id: 'time_bomb',
        name: '時限爆弾',
        category: 'SPECIAL',
        image: '/images/time_bomb.png',
        desc: '【ドロー時】即時発動(+1,000点)。8ターン後に爆発(-6,000点/手札防御全破棄/選択不可2T)。自ターン開始毎+1,000点。±3,000点差の相手に50%で受け渡し可能。無敵・ステロイドで消滅。'
    },
    {
        id: 'omamori_koban',
        name: 'お守り小判',
        category: 'SPECIAL',
        image: '/images/omamori_koban.png',
        desc: '【使用時】自分の得点を+3,000点する。\n【所有時】自分が「ダイヤの剣」の対象となった時、手札のこのカードを自動で消費して「ダイヤの剣」の効果を無効化し、さらに自分の得点を+3,000点する。'
    },
    {
        id: 'omamori_koban_set',
        name: 'お守り小判セット',
        category: 'SPECIAL',
        image: '/images/omamori_koban_set.png',
        desc: '【使用時】自分の得点を+2,000点する。\n【所有時】自分が「ダイヤの剣」の対象となった時、自動で1回分消費し、「ダイヤの剣」を回避した上で自分の得点を+2,000点する。\n【残り回数】3回'
    },
    {
        id: 'omamori_oban',
        name: 'お守り大判',
        category: 'SPECIAL',
        image: '/images/omamori_oban.png',
        desc: '【使用時】自分の得点を+3,000点〜+8,000点の範囲で選択して加算する。\n【所有時】自分が「ダイヤの剣」の対象となった時、手札のこのカードを自動で消費し、「ダイヤの剣」を回避した上で自分の得点を+8,000点する。\n<span style="color:#e67e22; font-weight:bold;">【制限】このターン中、手札から他のカードを使用できない。</span>'
    },
    {
        id: 'disaster',
        name: '大災害',
        category: 'ATTACK',
        image: '/images/disaster.png',
        desc: '【使用時】相手全員に順位に応じたダメージを与える。\n1位:6,000点/2位:4,000点/3位:2,000点/4位:1,000点\n【追加効果】対象の手札・防御カードをすべて破棄する。'
    },
    {
        id: 'invincible_armor',
        name: '無敵アーマー',
        category: 'SPECIAL',
        image: '/images/invincible_armor.png',
        desc: '【使用時】4ターンの間、あらゆる攻撃カードの効果を受けなくなる「無敵状態」になる。\n【追加効果】このカードによる「無敵状態」解除時、自分の得点を+1,000点し、これにより得点差が追いついた相手がいた場合、50%の確率でその相手の手札・防御カードをすべて捨て、さらに3,000点ダメージを与える。\n【所有時】一部を除く攻撃カードの対象となった時、手札のこのカードを自動で使用する。'
    },
    {
        id: 'dark_matter',
        name: 'ダークマター',
        category: 'SPECIAL',
        image: '/images/dark_matter.png',
        desc: '【使用時】自分の得点を+5,000点し、次の自分のターン開始時まで、あらゆる攻撃カードの効果を受けなくなる「無敵状態」になる。\n【追加効果】このカードの使用により得点差が追いついた相手がいた場合、50%の確率でその相手の手札・防御カードをすべて捨て、さらに3,000点ダメージを与える。\n【所有時】一部を除く攻撃カードの対象となった時、手札のこのカードを自動で使用する。\n<span style="color:#e67e22; font-weight:bold;">【制限】このターン中、手札から他のカードを使用できない。</span>'
    },
    {
        id: 'steroid',
        name: 'ステロイド',
        category: 'SPECIAL',
        image: '/images/steroid.png',
        desc: '【使用時】4ターンの間、一部を除く攻撃カードの効果を受けなくなる「ステロイド状態」になる。\n【追加効果】「ステロイド状態」解除時、自分の得点を+1,000点し、これにより得点差が追いついた相手がいた場合、50%の確率でその相手の手札・防御カードをすべて捨て、さらに3,000点ダメージを与える。\n【所有時】一部を除く攻撃カードの対象となった時、手札のこのカードを自動で使用する。'
    },
    {
        id: 'smoke_screen',
        name: '煙幕',
        category: 'ATTACK',
        image: '/images/smoke_screen.png',
        desc: '【使用時】自分以上の得点を持つ相手全員に1,000点ダメージを与える。\n【追加効果】対象に攻撃カード使用時の命中率が半減される「暗闇状態」を付与する。「暗闇状態」は対象プレイヤーのターン終了時まで継続する。'
    }
];

// デフォルト共通アバターID
const DEFAULT_AVATAR_ID = 'avatar_default';

// 選択可能なシステムプリセットアバター一覧
const PRESET_AVATARS = [
    { id: 'avatar_1', name: '男性', image: '/images/avatars/avatar_1.png' },
    { id: 'avatar_2', name: '女性', image: '/images/avatars/avatar_2.png' },
    { id: 'avatar_3', name: '少年', image: '/images/avatars/avatar_3.png' },
    { id: 'avatar_4', name: '少女', image: '/images/avatars/avatar_4.png' },
    { id: 'avatar_5', name: 'ニワトリ', image: '/images/avatars/avatar_5.png' },
    { id: 'avatar_6', name: '牛', image: '/images/avatars/avatar_6.png' }
];

// カード排出ON/OFF設定の初期値
function createInitialCardSettings() {
    return {
        omamori_koban: true,
        omamori_koban_set: true,
        omamori_oban: true,
        wood_sword: true,
        wood_sword_set: true,
        shotgun: true,
        grenade: true,
        diamond_sword: true,
        earthquake: true,
        time_bomb: true,
        wood_shield: true,
        wood_shield_set: true,
        bronze_shield: true,
        bronze_shield_set: true,
        disaster: true,
        invincible_armor: true,
        dark_matter: true,
        steroid: true,
        smoke_screen: true
    };
}

// カードのランダム獲得ロジック（セットカード重複所持制限対応）
function getRandomAvailableCard(player, cardSettings) {
    let availableCards = CARD_DECK.filter(c => cardSettings[c.id] !== false);

    if (player) {
        const setCardIds = ['wood_shield_set', 'bronze_shield_set', 'wood_sword_set'];
        const hasAnySetInHand = player.hand && player.hand.some(c => setCardIds.includes(c.id));
        const hasAnySetInDefense = player.defenseCard && player.defenseCard.card && setCardIds.includes(player.defenseCard.card.id);

        if (hasAnySetInHand || hasAnySetInDefense) {
            availableCards = availableCards.filter(c => !setCardIds.includes(c.id));
        }
    }

    const pool = availableCards.length > 0 ? availableCards : CARD_DECK;
    const template = pool[Math.floor(Math.random() * pool.length)];
    const instance = {
        ...template,
        instanceId: 'card_' + Date.now() + '_' + Math.floor(Math.random() * 1000)
    };

    if (instance.id === 'wood_shield_set' || instance.id === 'bronze_shield_set' || instance.id === 'wood_sword_set' || instance.id === 'omamori_koban_set') {
        instance.usesLeft = 3;
    }

    return instance;
}

module.exports = {
    CARD_DECK,
    DEFAULT_AVATAR_ID,
    PRESET_AVATARS,
    createInitialCardSettings,
    getRandomAvailableCard
};