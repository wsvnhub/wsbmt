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
        "gradient-radial": "radial-gradient(var(--tw-gradient-stops))",
        "gradient-conic":
          "conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))",
      },
      colors: {
        primary: "#029d81",
        secondary: "#ffec88",
        "table-header": "#c4fff4",
        "table-col1": "#02846c",
        "table-col3": "#00acbd",
        "table-col2": "#d8ffda",
      },
    },
  },
  plugins: [],
};
export default config;
