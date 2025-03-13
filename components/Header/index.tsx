import React from 'react'

export const Header = ({ isSchedule, selectedDate, setSelectedDate, children, headerPadding }: any) => {
    return <header
        className={`${headerPadding} lg:sticky bg-primary ${isSchedule ? "top-8" : "top-0"} flex flex-col lg:flex-row items-center lg:gap-4 gap-2 justify-between z-30`}
    >
        <h1 className="text-lg lg:text-xl font-semibold my-2 text-center lg:text-left lg:mb-0">
            {isSchedule && (
                <>
                    Đặt sân theo giờ <br />
                </>
            )}
            Ways Station Badminton
        </h1>
        {isSchedule && (
            <>
                <div className="flex justify-center items-center gap-4">
                    <a href="https://diachi.ways.vn/san" target="_blank" className="text-white underline italic">
                        Xem giá, hướng dẫn
                    </a>

                    <input
                        onChange={(e) => {
                            const value = e.target.value;
                            const currentDate = new Date();
                            let date = new Date(currentDate);
                            if (value !== "") {
                                date = new Date(value);
                            }
                            setSelectedDate(date);
                        }}
                        className="bg-white text-primary font-semibold pl-6 pr-2 py-2 rounded-md"
                        type="date"
                        min={new Date().toLocaleDateString('en-ca')}
                        placeholder="dd-mm-yyyy"
                        onKeyDown={(e) => e.preventDefault()}
                        value={selectedDate.toLocaleDateString('en-ca')}
                    />
                </div>
                <div className="lg:my-4">
                    {children}
                </div>
                <div className="w-full lg:w-auto flex flex-row-reverse lg:flex-col gap-2 lg:gap-4 items-center">
                    <a
                        href="tel:0389145575"
                        className="w-5/12 text-right lg:w-full p-2 lg:py-2 lg:px-4 rounded-lg font-semibold italic text-[10px] lg:text-[15px] bg-gradient-to-b from-blue-500 to-cyan-500"
                    >
                        Khách đặt lịch cố định: <br /> Gọi 0389145575
                    </a>
                    <div className="w-7/12 lg:w-full flex items-center gap-2 lg:gap-6 text-sm">
                        <div className="flex items-center justify-center gap-2">
                            <div className="bg-white w-4 h-4 lg:w-6 lg:h-6 rounded-sm lg:rounded-md" />
                            <span>Trống</span>
                        </div>
                        <div className="flex items-center justify-center gap-2">
                            <div className="bg-red-400 w-4 h-4 lg:w-6 lg:h-6 rounded-sm lg:rounded-md" />
                            <span>Đã đặt</span>
                        </div>
                        <div className="flex items-center justify-center gap-2">
                            <div className="bg-yellow-500 w-4 h-4 lg:w-6 lg:h-6 rounded-sm lg:rounded-md" />
                            <span>Đang chọn</span>
                        </div>
                    </div>
                </div>
            </>
        )}
    </header>
};