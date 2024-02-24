import React, { useEffect, useRef } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid"; // a plugin!
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction"; // needed for dayClick

const ScheduleClass = () => {
  const calendarRef = useRef(null);
  const handleDateClick = (arg) => {
    // bind with an arrow function

    console.log("args", arg);
  };
  useEffect(() => {
    if (calendarRef.current) {
      const newEvent = {
        title: "New Event useffect",
        start: "2023-08-16T08:00:00", // Start date and time of the event
        end: "2023-08-16T09:00:00",
      };
      const calendarApi = calendarRef.current.getApi();
      calendarApi.addEvent(newEvent);
    }
  }, []);
  return (
    <FullCalendar
      ref={calendarRef}
      plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
      dateClick={handleDateClick}
      initialView="dayGridMonth"
      headerToolbar={{
        left: "prev,next today",
        center: "title",
        right: "dayGridMonth,timeGridWeek,timeGridDay",
      }}
      displayEventTime={false}
      eventTimeFormat={{
        hour: "numeric",
        minute: "2-digit",
        meridiem: true,
      }}
      events={[
        {
          title: "Event 2",
          start: "2023-08-16T14:30:00",
          end: "2023-08-16T16:00:00",
        },
        // Add more events here
      ]}
    />
  );
};

export default ScheduleClass;
