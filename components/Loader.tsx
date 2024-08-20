import { Spin } from "antd";
import React from "react";

export default function Loader() {
  return (
    <div className="flex flex-col items-center h-screen justify-center gap-4">
      <div className="w-full flex flex-col md:flex-row items-center justify-center gap-2">
        <img src="./logo.png" alt="logo" />
        <h1 className="text-3xl font-semibold text-center">
          Ways Station Badminton
        </h1>
      </div>
      <div>
        <Spin wrapperClassName="text-primary" size="large" />
      </div>
    </div>
  );
}
