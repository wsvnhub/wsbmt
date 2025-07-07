import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      backgroundImage: {
         "gradient-radial": "radial-gradient(#FA9654, #CC3D00)",
        "gradient-conic": "conic-gradient(from 180deg at 50% 50%, #FA9654, #CC3D00)",
      },
      colors: {
        primary: "#049AF0", // giữ nguyên
        secondary: "#ffec88", // giữ nguyên
        "table-header": "#00acbd", // đổi từ #c4fff4
        "table-col1": "#049AF0", // đổi từ #02846c
        "table-col3": "#008849", // đổi từ #00acbd
        "table-col2": "#cceeff", // đổi từ #d8ffda
      },
    },
  },
  plugins: [],
};
export default config;
