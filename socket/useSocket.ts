import React, { useEffect, useState } from "react";
import { socket } from "./socket";

export default function useSocket() {
  const [isConnected, setIsConnected] = useState(false);
  const [transport, setTransport] = useState("N/A");

  useEffect(() => {
    if (socket.connected) {
      onConnect();
    }

    function onConnect() {
      setIsConnected(true);
      setTransport(socket.io.engine.transport.name);

      socket.io.engine.on("upgrade", (transport) => {
        setTransport(transport.name);
      });
    }

    function onDisconnect() {
      setIsConnected(false);
      setTransport("N/A");
    }

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
    };
  }, []);
  const getInfo = React.useCallback(async ({ selectedDate, isAdmin = false, size = 10 }: any) => {
    const res = await socket.emitWithAck("app:info", {
      size,
      selectedDate,
      isAdmin
    });
    return res;
  }, []);

  const getCourts = React.useCallback(
    async (
      facilitiyIds: string[],
      range: { startDate: string; endDate: string },
      dates: string[]
    ) => {
      const res = await socket.emitWithAck("schedules:list", {
        facilitiyIds,
        range,
        dates,
      });
      return res.data;
    },
    []
  );
  const createSchedules = React.useCallback(
    async (data: any, timeSlotsData: any) => {
      const res = await socket.emitWithAck("schedules:create", {
        timeSlotsData,
        schedulesData: data,
      });
      return res;
    },
    []
  );
  const deleteSchedules = React.useCallback((data: any) => { }, []);
  const updateSchedules = React.useCallback(async (transactionCode: string) => {
    try {
      const res = await socket.emitWithAck("schedules:update", {
        code: transactionCode,
      });
      console.log("send success", transactionCode)
      return res;
    } catch (error) {
      console.log("updateSchedules error", error)
    }
  }, [socket]);
  const sendUpdateSchedules = React.useCallback(async (timeSlots: any) => {
    const res = await socket.emitWithAck("schedules:send-info", {
      timeSlots,
    });
    return res;
  }, []);
  const sendUpdateSchedulesManual = React.useCallback(async ({ timeSlotData, data }: any, action = "add") => {
    const res = await socket.emitWithAck("schedules:manual", {
      timeSlots: timeSlotData,
      data,
      action
    });
    return res;
  }, []);
  const sendUpdateFixedSchedulesManual = React.useCallback(async ({ data }: any) => {
    const res = await socket.emitWithAck("schedules:manual:fixed", { data });
    return res;
  }, []);
  return {
    socket,
    transport,
    isConnected,
    getInfo,
    getCourts,
    updateSchedules,
    createSchedules,
    deleteSchedules,
    sendUpdateSchedules,
    sendUpdateSchedulesManual,
    sendUpdateFixedSchedulesManual
  };
}
