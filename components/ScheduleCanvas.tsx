import React from "react";
import { useEffect, useRef, useState } from "react";

const ScheduleCanvas = ({ scheduleData, setScheduleData }: any) => {
  const canvasRef = useRef<any>(null);
  const [slotWidth, setSlotWidth] = useState(70);
  const slotHeight = 30;
  const margin = 10;

  const drawSchedule = React.useCallback(
    (ctx: any) => {
      canvasRef.current.width = (slotWidth + margin) * 7 + margin;
      canvasRef.current.height =
        (slotHeight + margin) * scheduleData.length + margin;

      ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);

      scheduleData.forEach((data: any, rowIndex: number) => {
        data.slots.forEach((slot: any, colIndex: number) => {
          const x = colIndex * (slotWidth + margin) + margin;
          const y = rowIndex * (slotHeight + margin) + margin;
          if (data.court === "time") {
            ctx.fillRect(x, y, slotWidth, slotHeight);
            ctx.strokeRect(x, y, slotWidth, slotHeight);
            ctx.fillStyle = "#fff";
            ctx.fillText(slot, x + 5, slotHeight / 2 + 5);
          } else {
            ctx.fillStyle = slot ? "red" : "white";
            ctx.fillRect(x, y, slotWidth, slotHeight);
            ctx.strokeRect(x, y, slotWidth, slotHeight);
          }
        });
      });
    },
    [scheduleData, slotWidth]
  );

  const handleCanvasClick = (e: any) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const colIndex = Math.floor(x / (slotWidth + margin));
    const rowIndex = Math.floor(y / (slotHeight + margin));

    if (colIndex < 7 && rowIndex < scheduleData.length) {
      const newScheduleData = [...scheduleData];
      newScheduleData[rowIndex].slots[colIndex] =
        !newScheduleData[rowIndex].slots[colIndex];
      setScheduleData(newScheduleData);
    }
  };
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    drawSchedule(ctx);
  }, [slotWidth, scheduleData, drawSchedule]);

  return (
    <div className="relative">
      <div>
        <canvas ref={canvasRef} onClick={handleCanvasClick} />
      </div>
      <div className="w-1/5 px-4 py-3 flex items-center border shadow-lg rounded-3xl bg-white absolute bottom-0 right-0">
        <input
          className="w-full"
          type="range"
          min="50"
          max="150"
          value={slotWidth}
          onChange={(e) => setSlotWidth(Number(e.target.value))}
        />
      </div>
    </div>
  );
};

export default ScheduleCanvas;
