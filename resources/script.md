# FieldNet Demo Script (2-4 minutes)

## INTRO (0:00 - 0:20)
*[Screen: Title slide or app loading]*

Every harvest season, farmers have to solve the logistics problem of how to best harvest their corn.

FieldNet helps corn solves this by using satellite data and simulation to optimize how you harvest your field."

---

## DRAWING THE FIELD (0:20 - 0:45)
*[Screen: Drawing rectangle on map]*

"Let's start by selecting a field. I'll draw a rectangle over this cornfield in central Illinois.

Once I have my field boundaries, I click 'Fetch Yield Map.' This pulls Sentinel-2 satellite imagery from Google Earth Engine and calculates estimated yield across the field in bushels per acre.

Notice how the yield varies—the red areas are high-yield, yellow is lower. This variation is key to our optimization."

---

## SETTING UP LOGISTICS (0:45 - 1:15)
*[Screen: Clicking road, entering silo address]*

"Next, I need to set up the logistics. I'll click on this road next to the field—this is where trucks will pick up grain from the hopper carts.

Now I enter the silo address. The system calculates the driving route and shows me it's about 5 miles away.

On the right, I can configure my fleet—number of trucks, their capacity, number of grain carts. These defaults are typical for a mid-size operation."

---

## THE CORE INSIGHT (1:15 - 1:45)
*[Screen: Queue control panel]*

"Here's where it gets interesting. This slider controls the silo queue time—how long trucks wait in line to unload.

When queues are short, you want to harvest high-yield areas first to maximize throughput. But when queues are long, that's actually backwards—you fill hoppers faster than trucks can cycle back, and the combine sits idle.

FieldNet tests both strategies and tells you which one is better for your conditions."

---

## RUNNING THE SIMULATION (1:45 - 2:30)
*[Screen: Click Run Simulation, show results]*

"Let me set a 15-minute queue time and run the simulation.

The system runs both cases simultaneously. Case 1 starts from the high-yield end. Case 2 starts from the low-yield end.

You can see the results here—Case 2 has less idle time because it slows down grain accumulation while trucks are stuck in queue. The system recommends Case 2 for these conditions.

If I change the queue to just 2 minutes... now Case 1 wins because trucks can cycle quickly."

---

## ANIMATION (2:30 - 3:15)
*[Screen: Playing animation]*

"Let's watch how this plays out. I'll hit play on the animation.

You can see the combine moving through the field, harvesting pass by pass. The hopper carts follow alongside, filling up with grain. Watch the fill gauges on the left.

When a hopper is full, a truck picks up the load and heads to the silo. You can see trucks traveling, waiting in queue, unloading, and returning.

The key metric is right here—idle events. That's how many times the combine had to stop and wait. Our goal is zero."

---

## WRAP UP (3:15 - 3:45)
*[Screen: Final results or return to overview]*

"So that's FieldNet. We're taking satellite yield data that already exists, combining it with a simulation of your actual fleet and silo conditions, and giving you a data-driven harvest strategy.

The result? Less idle time, faster harvest, and the ability to adapt when conditions change mid-season.

Thanks for watching."

---

## Recording Tips

- **Pace:** Speak slightly slower than normal conversation
- **Pauses:** Leave 1-2 second gaps between sections for editing
- **Screen sync:** Practice the clicks so your narration matches the visuals
- **Energy:** Keep it conversational but confident—you're solving a real problem

**Total runtime estimate:** 3:00 - 3:45 depending on pace
