import pathlib
r=pathlib.Path('review456/qa');r.mkdir(exist_ok=True)
source=pathlib.Path('calibrate-auth-qa/e2e/expo-web/food-quantity-entry.spec.ts').read_text().replace("from './fixtures'","from '../../calibrate-auth-qa/e2e/expo-web/fixtures'")
(r/'core.spec.ts').write_text(source)
c=pathlib.Path('review456/owner/implementation/controls.spec.ts').read_text().replace("'../quantity-fix-448/e2e/expo-web/fixtures'","'../../calibrate-auth-qa/e2e/expo-web/fixtures'")
(r/'controls.spec.ts').write_text(c)
