// Duelist banter. Original lines written in each character's voice — not show
// transcripts. `say` fires on your own moments, `reply` on your opponent's.

export const BANTER = {
  yugi: {
    say: {
      ace: [
        "Dark Magician — I've been waiting for you.",
        "My most trusted friend answers the call!",
        "This card and I have been through everything together.",
      ],
      bigSummon: [
        "The cards are with me. {card}, take the field!",
        "You'll need more than raw power to beat {card}.",
      ],
      fusion: [
        "Two monsters, one will — {card} rises!",
        "Fusion Summon! This is the bond you keep underestimating.",
      ],
      trap: [
        "I set this three turns ago. Reveal — {card}!",
        "Every move you made led here. {card}, activate!",
      ],
      bigHit: [
        "That's what conviction looks like.",
        "Feel that? That's my deck fighting back.",
      ],
      direct: ["Straight through! Nothing between us now.", "No monsters, no shield — this one's yours."],
      hurt: ["Ngh — I felt that one.", "You hit hard. But I'm still standing."],
      low: [
        "I'm not out. As long as I have one card left, I have a chance.",
        "My life points are low — my resolve isn't.",
      ],
      winning: ["Don't give up. You still have a move.", "The duel isn't over until the last card is drawn."],
      losing: ["I just need one card. And I trust my deck to give it to me.", "Come on… heart of the cards."],
      topdeck: ["I drew exactly what I needed. That's not luck — that's trust.", "There you are. Right on time."],
    },
    reply: {
      vsAce: ["So that's your ace. I'm not afraid of it.", "Impressive. But power alone has never beaten me."],
      vsFusion: ["A fusion? Then I'll answer it.", "You brought your best. Good — so did I."],
      vsTrap: ["A trap. I should have seen it.", "Clever. I won't fall for that twice."],
      vsBigHit: ["That hurt — but it woke me up.", "Is that all? Then it's my turn."],
      vsDirect: ["Ugh! Straight through my defences.", "I left myself open. That won't happen again."],
    },
  },

  kaiba: {
    say: {
      ace: [
        "Behold the ultimate creature — Blue-Eyes White Dragon!",
        "You're staring at perfection. Try not to blink.",
        "My dragon doesn't need luck. It needs a target.",
      ],
      bigSummon: ["{card}. Consider it a formality.", "I don't summon monsters. I deploy weapons."],
      fusion: ["Three dragons, one apex. {card}!", "This is the card your entire deck was built to lose to."],
      trap: ["You walked straight into it, like every amateur before you. {card}!", "Predictable. {card}, activate."],
      bigHit: ["That's the difference between us.", "Was that supposed to be a strategy?"],
      direct: ["Nothing left to hide behind.", "Wide open. How disappointing."],
      hurt: ["Tch. A scratch.", "Enjoy that. It won't happen again."],
      low: [
        "Low life points don't frighten me. Losing does — and I don't lose.",
        "You've done nothing but delay the inevitable.",
      ],
      winning: ["This duel ended the moment you sat down.", "Concede. You'll save us both the time."],
      losing: ["No. I refuse to lose to you again.", "My deck is flawless. The error is temporary."],
      topdeck: ["Exactly the card I designed this deck to draw.", "That's not chance. That's engineering."],
    },
    reply: {
      vsAce: ["That relic? My dragon eats worse before breakfast.", "Your ace is a footnote."],
      vsFusion: ["A fusion. How quaint.", "You needed two cards to reach what I do with one."],
      vsTrap: ["A trap card. The last refuge of a weak deck.", "Hiding behind face-downs. Pathetic."],
      vsBigHit: ["Luck. Nothing more.", "Take your points. I'm taking the duel."],
      vsDirect: ["A direct hit. Don't get comfortable.", "You'll pay for that in full."],
    },
  },

  joey: {
    say: {
      ace: [
        "Red-Eyes Black Dragon — let's light this place up!",
        "Here comes my main man! Red-Eyes, get out here!",
        "You wanted my best? You're lookin' at him.",
      ],
      bigSummon: ["{card}'s on the field, and he ain't happy!", "Check it out — {card}! Who's laughin' now?"],
      fusion: ["Polymerization! Say hello to {card}!", "Two of mine make one of him. {card}, let's go!"],
      trap: ["Ha! Gotcha! {card}, do your thing!", "Bet you didn't see that comin'. {card}!"],
      bigHit: ["Boom! How'd that taste?", "That's for every time you called me a rookie!"],
      direct: ["Nothin' in my way — this one's goin' straight through!", "Wide open! Sorry not sorry!"],
      hurt: ["Ow! Okay, okay, that one stung.", "Alright, that was a good shot. I'll give ya that."],
      low: [
        "I've been down worse than this. Don't count me out!",
        "Low on life points, high on nerve. Let's go!",
      ],
      winning: ["Who's the underdog now, huh?", "I'm actually winnin'! Nobody tell me, I'll jinx it."],
      losing: ["I ain't done. Not even close.", "One good draw. That's all I need. Come on…"],
      topdeck: ["Yes! Exactly what I needed! Told ya I'm lucky!", "Ha! The deck's got my back!"],
    },
    reply: {
      vsAce: ["So that's the big scary one? Doesn't look so tough.", "Nice monster. Shame about what's gonna happen to it."],
      vsFusion: ["Aw come on, a fusion? Now you're just showin' off.", "Two monsters? That's cheatin'! ...it's not, but still!"],
      vsTrap: ["A trap?! Oh, you gotta be kiddin' me!", "Every time! Every single time!"],
      vsBigHit: ["Agh! Alright, that one hurt.", "Lucky shot! Won't happen twice!"],
      vsDirect: ["Straight to the face! Not cool!", "Okay, ow. Message received."],
    },
  },

  mai: {
    say: {
      ace: [
        "Meet my Harpie's Pet Dragon, hon. She doesn't share the spotlight.",
        "Time to show you what real elegance looks like.",
        "My girls have been waiting for this.",
      ],
      bigSummon: ["{card}. Try to keep up, sweetheart.", "Say hello to {card}. Say goodbye to your board."],
      fusion: ["{card}. Beauty and power — I don't compromise.", "Watch closely. {card} takes the field."],
      trap: ["Too slow, hon. {card}!", "Did you really think I'd leave that zone empty? {card}!"],
      bigHit: ["Was that too much? I'd apologise, but I won't.", "That's what happens when you underestimate me."],
      direct: ["Nothing in the way. How careless of you.", "Straight through, darling."],
      hurt: ["Ugh. You'll pay for that one.", "Cute. Do it again and I'll get annoyed."],
      low: ["Low life points look good on me. Watch.", "Don't celebrate yet, hon. I duel best cornered."],
      winning: ["This is almost too easy.", "I'd offer you a rematch, but let's finish this one first."],
      losing: ["No. I'm not losing to you.", "Fine. You want a real duel? You've got one."],
      topdeck: ["Perfect draw. Of course it was.", "The deck knows what I need. It always does."],
    },
    reply: {
      vsAce: ["So that's your prize card. It's… fine, I guess.", "Big monster. Big target."],
      vsFusion: ["A fusion? Someone's been practising.", "Cute trick. My girls have seen worse."],
      vsTrap: ["A face-down. And here I thought you were bluffing.", "Nice one. I'll remember that."],
      vsBigHit: ["Ow — okay, that one actually landed.", "Don't look so pleased with yourself."],
      vsDirect: ["Straight through! You little—", "Fine. Point taken. Now it's my turn."],
    },
  },
};

export const SITUATIONS = [
  "ace", "bigSummon", "fusion", "trap", "bigHit", "direct",
  "hurt", "low", "winning", "losing", "topdeck",
];

export const REPLY_FOR = {
  ace: "vsAce", fusion: "vsFusion", trap: "vsTrap", bigHit: "vsBigHit", direct: "vsDirect",
};
