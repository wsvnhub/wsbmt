import React from "react";

export default function HeaderCell(props: any) {
  const { children, onResize, width, ...restProps } = props;
  const [_, text] = children;
  if (!text) {
    return <th {...restProps} />;
  }

  const [time, date] = text.split(" ");
  return (
    <th {...restProps}>
      {time}
      <p className="absolute bottom-0 right-2 text-primary text-[7px]">{date}</p>
    </th>
  );
}
