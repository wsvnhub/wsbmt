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
  const getInfo = React.useCallback(async () => {

    const res = await socket.emitWithAck("app:info", {
      size: 10,
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
    const res = await socket.emitWithAck("schedules:update", {
      code: transactionCode,
    });
    return res;
  }, []);
  const sendUpdateSchedules = React.useCallback(async (timeSlots: any) => {
    const res = await socket.emitWithAck("schedules:send-info", {
      timeSlots,
    });
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
  };
}
