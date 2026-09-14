# Meal summary rows and attached date navigation

Today summarizes the six meal periods without individual food items. Empty periods use
neutral "No entries" text; zero-calorie entries still show a logged total. The entire
food pane, including spare height and side gutters, opens the detailed log. Short
screens scroll the complete rows above the action dock.

Food log, Activity, and Weight use the same continuous navbar surface and unified date
toolbar as Today, while retaining their route widths and date behavior. The detailed Food log also displays empty meal periods as compact "No entries" rows, including all six periods on an empty day.

| Screen | Before | After |
| --- | --- | --- |
| Today, 390px | ![Today before](today-before.png) | ![Today after](today-after.png) |
| Food log, 390px | ![Food log before](food-log-before.png) | ![Food log after](food-log-after.png) |

Additional evidence:

- [320px page scrolled to the complete final meal row](today-short-scrolled.png)
- [Tall desktop with spare space inside the food navigation pane](today-tall-desktop.png)

Browser regression checks verify the bottom-right blank area navigates to Food log,
all six rows remain reachable at 320px and 200% text, and the date toolbar keeps its
vertical position and continuous navbar surface across Today, Food log, Activity,
and Weight. These screenshots use deterministic test data; native device runtime
validation is separate.
