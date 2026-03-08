I am working on a problem involving precision agriculture. I am trying to build a system that takes the following data:

1. Field data: a square patch with a heatmap overlayed which shows the variable yield of that patch. This is estimated using Google EarthEngine.

2. Silo location data

3. Count of semi-trucks

4. Count of grain hoppers

From this data there are key metrics we care about:

1. Field heatmap with variable yield: As a combine harvester moves through the cornrows, the total yield collected so far should be able to be calculated.
   
2. Time to silo: Calculated as (time needed given distance to silo + silo queue time)

3. Fleet cycle time = for the semi-trucks: (time to silo + queue time + unload time + return time)


With this data, we are trying to figure out which order to process the field of corn (which is set up in cornrows) to minimize the time at which the combine harvester is left idle due to there being too few semi-trucks available to load the grain into (the system is full). 

There are two cases we are trying to figure out based on the data we collect:

Case 1: Process from highest yield to lowest yield.

This is the most logical approach and the approach farmers would take given there is no queue. The farmer processes corn at max capacity given normal no conditions (no queue). This would have to be calculated anyways because the operational efficiency under normal conditions will influence decisions about operational efficnecy under subnormal conditions (a queue exists).

Case 2: Process from lowest yield to highest yield.

This is the approach that farmers would take if there is a queue that would disrupt normal operations (i.e. due to the queue the trucks aren't able to come back in time, and all the existing grain hoppers are full). 

In both cases, it should be able to determine what is the most time-optimal silo using the formula provided. The system will have  a real-time queue estimate. 

Silo selection is a harvest-level commitment (since travel time to silo is only 5-10 minutes, while queue times are the bigger issue and can range from 30 mins to 1 hr)

In both cases, it should know when to switch to the other case (or if that is not efficient because wasting time moving to the other side of the field will waste time, and because it's already close enough to the other side where it'll be fine. essentially, the real problem won't be as black and white as having a high yield and low yield side, and we'll have to account for that)

A fleet feasibility check should run before any sequence is recommended. If fleet cycle time > total hopper buffer time, flag this as "fleet undersized" and recommend a minimum truck count. This assumes there is no queue.

re-run the feasibility check whenever queue wait crosses a defined threshold — not just at harvest start

A dynamic threshold for Case 2 would make the switching logic operational. Something like: harvest low-yield rows while queue wait > X minutes, switch to optimal sequence when queue wait drops below X.
X minutes should be calculated as X = (fleet cycle time) − (hopper buffer time remaining)

Switch is beneficial if: (idle time prevented by switching) > (travel time to reach low-yield rows) + (efficiency loss from suboptimal sequencing)

If the system has been in Case 2 for longer than one full fleet cycle time with no improvement in queue wait, abandon Case 2, accept the idle risk, and return to Case 1 sequence.

Efficiency loss = (yield rate of best available row − yield rate of target low-yield row) × time spent on low-yield row

Row-level yield aggregation: total bushels per row

Also have a simulation layer simulation of one harvest cycle (combine moves, hopper fills, truck dispatched, truck returns) would let you test whether a given sequence actually reduces idle time before running it in the field.

The simulation should be able to output:
    Number of combine idle events (duration + cause)
    Number of hopper overflow risk moments
    Actual vs. predicted fleet cycle time
    Sequence efficiency score vs. Case 1 baseline

hopper fill level updates continuously from the yield monitor integration, not from discrete row-entry events.


