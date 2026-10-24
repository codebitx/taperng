import type { Locale, PrizeInput } from "./protocol";

export interface ExampleDraw {
  name: string;
  participantCount: number;
  prizes: PrizeInput[];
}

const DRAW_NAMES: Record<Locale, string[]> = {
  zh: [
    "年会抽奖",
    "产品发布会",
    "团队下午茶",
    "周年庆",
    "迎新派对",
    "季度之星",
    "客户答谢",
    "感恩节大促",
  ],
  en: [
    "Annual Party Lottery",
    "Product Launch",
    "Team Tea Break",
    "Anniversary",
    "Welcome Party",
    "Quarterly Star",
    "Client Appreciation",
    "Thanksgiving Sale",
  ],
};

const PRIZE_NAMES: Record<Locale, string[]> = {
  zh: [
    "50 元红包",
    "100 元红包",
    "咖啡券",
    "京东 E 卡",
    "机械键盘",
    "蓝牙音箱",
    "运动手环",
    "便携投影仪",
    "团队聚餐券",
    "年度最佳奖",
    "显示器",
  ],
  en: [
    "50 CNY Red Packet",
    "100 CNY Red Packet",
    "Coffee Voucher",
    "JD Gift Card",
    "Mechanical Keyboard",
    "Bluetooth Speaker",
    "Fitness Band",
    "Mini Projector",
    "Team Dinner Voucher",
    "Annual Award",
    "Monitor",
  ],
};

function pick<T>(source: T[]): T {
  return source[Math.floor(Math.random() * source.length)]!;
}

/**
 * 返回一个随机但「符合逻辑」的抽奖示例，用于初始化发布表单：
 * 参与人数 20–200、奖品 1–4 类、每类数量 1–3，保证 winnerCount ≤ participantCount 且 ≤ 100。
 * 仅供 UI 初始化演示，非密码学用途，无需强随机源。
 */
export function randomExampleDraw(locale: Locale): ExampleDraw {
  const participantCount = 20 + Math.floor(Math.random() * 181); // 20..200
  const prizeCount = 1 + Math.floor(Math.random() * 4); // 1..4

  const pool = [...PRIZE_NAMES[locale]];
  const selected: string[] = [];
  for (let i = 0; i < prizeCount; i += 1) {
    selected.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]!);
  }

  return {
    name: pick(DRAW_NAMES[locale]),
    participantCount,
    prizes: selected.map((name) => ({
      name,
      quantity: 1 + Math.floor(Math.random() * 3), // 1..3
    })),
  };
}

export function exampleDraw(locale: Locale): ExampleDraw {
  if (locale === "zh") {
    return {
      name: "年会抽奖",
      participantCount: 100,
      prizes: [
        { name: "50 元红包", quantity: 3 },
        { name: "100 元红包", quantity: 2 },
        { name: "小米笔记本", quantity: 1 },
        { name: "iPhone 17", quantity: 1 },
      ],
    };
  }
  return {
    name: "Annual Party Lottery",
    participantCount: 100,
    prizes: [
      { name: "50 CNY Red Packet", quantity: 3 },
      { name: "100 CNY Red Packet", quantity: 2 },
      { name: "Xiaomi Laptop", quantity: 1 },
      { name: "iPhone 17", quantity: 1 },
    ],
  };
}