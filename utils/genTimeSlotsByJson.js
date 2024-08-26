import timeSlots from "../data/timeSlots.json" with { type: "json" };
export function generateTimeArray(cluster) {
  return timeSlots[cluster].map((timeslot) => {
    const { time } = timeslot;
    const [from, to] = time.split("-");
    return {
      facility: "",
      court: "",
      from,
      to,
      hour: 1,
      status: "empty",
      bookedBy: {
        name: "",
        phone: "",
      },
      isFixed: false,
      availability: true,
    };
  });
}
