export function generateTimeArray(
  start,
  intervalMinutes,
  endNextDay
) {
  const result = [];
  let currentTime = new Date();
  currentTime.setHours(start); // Set to 0:15 today

  let endOfDay = new Date(currentTime);
  endOfDay.setHours(24, 0, 0, 0); // Set to 24:00 today (midnight)

  let nextDay = new Date(currentTime);
  nextDay.setDate(nextDay.getDate() + 1);
  nextDay.setHours(0, 10, 0, 0); // Set to 0:10 next day

  while (currentTime < nextDay) {
    let endTime = new Date(currentTime);
    endTime.setMinutes(endTime.getMinutes() + intervalMinutes);

    if (endTime > nextDay) {
      endTime = nextDay;
    }
    const from = `${currentTime.getHours()}:${currentTime
      .getMinutes()
      .toString()
      .padStart(2, "0")}`;
    const to = `${endTime.getHours()}:${endTime
      .getMinutes()
      .toString()
      .padStart(2, "0")}`;

    let timeObject = {
      facility: "",
      court: "",
      from,
      to,
      hour: 0,
      status: "empty",
      bookedBy: {
        name: "",
        phone: "",
      },
      isFixed: false,
      availability: true,
    };

    result.push(timeObject);

    currentTime = endTime;
  }

  return result;
}
