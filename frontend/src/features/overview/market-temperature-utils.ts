export type TemperatureTone = {
  accent: string;
  description: string;
  glow: string;
  label: string;
  range: string;
};

export function clampTemperature(value: number) {
  return Math.min(100, Math.max(0, value));
}

export function temperatureTone(value: number): TemperatureTone {
  const temperature = clampTemperature(value);
  if (temperature < 35) {
    return {
      accent: "#5bb6e8",
      description: "市场温度偏冷",
      glow: "rgba(91, 182, 232, 0.34)",
      label: "低迷",
      range: "0—35",
    };
  }
  if (temperature < 60) {
    return {
      accent: "#78c0a1",
      description: "市场温度平稳",
      glow: "rgba(120, 192, 161, 0.3)",
      label: "平稳",
      range: "35—60",
    };
  }
  if (temperature < 80) {
    return {
      accent: "#f0ae52",
      description: "市场活跃度上升",
      glow: "rgba(240, 174, 82, 0.34)",
      label: "偏热",
      range: "60—80",
    };
  }
  return {
    accent: "#f05a4f",
    description: "市场温度过高",
    glow: "rgba(240, 90, 79, 0.42)",
    label: "过热",
    range: "80—100",
  };
}
