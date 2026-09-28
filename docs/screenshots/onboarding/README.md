# Onboarding visual evidence

The previous initial onboarding screen is preserved in `before/` at 320, 390, 820,
and 1440px in both themes. Reviewed replacements live in the Playwright baseline
folder, covering all three steps at the same widths. Additional 320px and 1440px
captures cover 200% text and forced colors. Imperial measurements also have enlarged-text captures at 320, 390, and 1440px. `bottom` images show the end of longer
scrollable steps.

| Screen | Light, 390px | Dark, 390px |
| --- | --- | --- |
| Previous initial screen | [Before](before/editorial-onboarding-light-ux-phone-390-win32.png) | [Before](before/editorial-onboarding-dark-ux-phone-390-win32.png) |
| About you | [After](../../../e2e/expo-web/launch-22-visual.spec.ts-snapshots/onboarding-about-you-light-ux-phone-390-win32.png) | [After](../../../e2e/expo-web/launch-22-visual.spec.ts-snapshots/onboarding-about-you-dark-ux-phone-390-win32.png) |
| Activity | [After](../../../e2e/expo-web/launch-22-visual.spec.ts-snapshots/onboarding-activity-light-ux-phone-390-win32.png) | [After](../../../e2e/expo-web/launch-22-visual.spec.ts-snapshots/onboarding-activity-dark-ux-phone-390-win32.png) |
| Your plan | [After](../../../e2e/expo-web/launch-22-visual.spec.ts-snapshots/onboarding-plan-light-ux-phone-390-win32.png) | [After](../../../e2e/expo-web/launch-22-visual.spec.ts-snapshots/onboarding-plan-dark-ux-phone-390-win32.png) |

About you asks for sex, date of birth, current weight, and height in that order. Male and Female
retain text labels alongside their icons. [Enlarged sex choices at 320px](sex-choices-enlarged-text-320.png)
show the labels and icons at 200% text size.

Unit buttons sit beside their numeric inputs. New accounts start with device measurement preferences
or a locale-based default, and saved choices remain in place.

Phone actions remain fixed when the form has enough room. They move into the
scrolling content when enlarged text or a short viewport would crowd the form.
The calorie target sits immediately above Start tracking.

These are browser captures, not Android device evidence. Native runtime review
requires a configured emulator or connected device.
