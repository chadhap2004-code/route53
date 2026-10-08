"""End-to-end smoke test of the main console flows (Playwright, headless Chromium).

Run against a running stack (backend :8000 + frontend :3000):
    pip install playwright && playwright install chromium
    python e2e/smoke_test.py
"""
import asyncio
import os

from playwright.async_api import async_playwright

ZONE = f"e2e-{os.getpid()}.example"
B = os.getenv("BASE_URL", "http://localhost:3000")
OUT = os.getenv("SCREENSHOT_DIR", "e2e/screenshots")
os.makedirs(OUT, exist_ok=True)


async def main():
    async with async_playwright() as p:
        br = await p.chromium.launch()
        pg = await br.new_page(viewport={"width": 1440, "height": 900})
        pg.set_default_timeout(15000)
        errors = []
        pg.on("pageerror", lambda e: errors.append(str(e)))
        await pg.goto(B + "/login")
        await pg.click("button[type=submit]")  # step 1: Next (demo user pre-filled)
        await pg.wait_for_selector("input[type=password]")
        await pg.click("button[type=submit]")  # step 2: Sign in (password pre-filled)
        await pg.wait_for_url("**/hostedzones")
        # create zone
        await pg.click("button:has-text('Create hosted zone')")
        await pg.fill("input[placeholder='example.com']", ZONE)
        await pg.fill("textarea", "Created by e2e")
        await pg.click("button:has-text('Add tag')")
        await pg.fill("input[placeholder='Enter key']", "owner")
        await pg.fill("input[placeholder='Enter value']", "palak")
        await pg.click("form button[type=submit]")
        await pg.wait_for_selector("text=was successfully created")
        await pg.wait_for_selector("text=Records (2)")
        print("zone created")
        # create two records, one invalid
        await pg.click("button:has-text('Create record')")
        await pg.fill("input[placeholder='subdomain']", "www")
        await pg.fill("textarea", "192.0.2.10\n192.0.2.11")
        await pg.click("button:has-text('Add another record')")
        names = pg.locator("input[placeholder='subdomain']")
        await names.nth(1).fill("bad")
        await pg.locator("textarea").nth(1).fill("999.1.1.1")
        await pg.click("form button[type=submit]")
        await pg.wait_for_selector("text=Invalid A value")
        await pg.screenshot(path=f"{OUT}/08-create-error.png", full_page=True)
        print("validation error shown")
        await pg.locator("textarea").nth(1).fill("192.0.2.99")
        await pg.click("form button[type=submit]")
        await pg.wait_for_selector("text=2 records were successfully created")
        await pg.wait_for_selector("text=Records (4)")
        print("records created")
        # select www row, split panel, edit
        await pg.locator("tr", has_text=f"www.{ZONE}").locator("input[type=checkbox]").check()
        await pg.wait_for_timeout(500)
        await pg.screenshot(path=f"{OUT}/09-split.png")
        await pg.click("button:has-text('Edit record') >> nth=0")
        await pg.wait_for_selector("text=Record details")
        await pg.fill("input[aria-label='TTL in seconds']", "60")
        await pg.click("form button[type=submit]")
        await pg.wait_for_selector("text=was successfully updated")
        print("record edited")
        # bulk delete two records
        await pg.locator("tr", has_text=f"www.{ZONE}").locator("input[type=checkbox]").check()
        await pg.locator("tr", has_text=f"bad.{ZONE}").locator("input[type=checkbox]").check()
        await pg.click("button:has-text('Delete records')")
        await pg.wait_for_selector("text=Delete 2 records?")
        await pg.screenshot(path=f"{OUT}/10-delete-records.png")
        await pg.click("[role=dialog] button:has-text('Delete')")
        await pg.wait_for_selector("text=2 records were successfully deleted")
        print("bulk delete ok")
        # import
        await pg.click("button:has-text('Import zone file')")
        await pg.click("button:has-text('Insert sample')")
        await pg.click("button:has-text('Preview')")
        await pg.wait_for_selector("text=Nothing has been saved yet")
        await pg.screenshot(path=f"{OUT}/11-import.png", full_page=True)
        await pg.click("button:has-text('Import 6 records')")
        await pg.wait_for_selector("text=Imported 6 record(s)")
        await pg.wait_for_selector("text=Records (8)")
        print("import ok")
        # search records by value
        await pg.fill("[data-shortcut=search] input", "192.0.2.2")
        await pg.wait_for_selector("text=1 match")
        print("record search ok")
        # delete zone blocked
        await pg.click("button:has-text('Delete zone')")
        await pg.wait_for_selector("text=This hosted zone still contains records")
        await pg.screenshot(path=f"{OUT}/12-delete-zone.png")
        await pg.click("[role=dialog] button:has-text('Cancel')")
        # export
        async with pg.expect_download() as dl:
            await pg.click("button:has-text('Export')")
            await pg.click("text=BIND zone file (.zone)")
        d = await dl.value
        print("export:", d.suggested_filename)
        # zone list search + dark mode + shortcuts
        await pg.goto(B + "/route53/v2/hostedzones")
        await pg.wait_for_selector("text=example.net")
        await pg.fill("[data-shortcut=search] input", ZONE)
        await pg.wait_for_selector("text=/\\d+ match/")
        await pg.locator("h1").first.click()
        await pg.keyboard.press("t")
        await pg.wait_for_timeout(600)
        await pg.screenshot(path=f"{OUT}/13-dark.png")
        await pg.keyboard.press("?")
        await pg.wait_for_selector("text=Show keyboard shortcuts")
        await pg.keyboard.press("Escape")
        await pg.wait_for_timeout(300)
        await pg.keyboard.press("t")
        print("shortcuts ok")
        # logout
        await pg.locator("button[aria-label=demo]:visible").click()
        await pg.click("text=Sign out")
        await pg.wait_for_url("**/login")
        await pg.goto(B + "/route53/v2/hostedzones")
        await pg.wait_for_url("**/login**")
        print("logout ok")
        print("PAGE ERRORS:", errors)
        await br.close()


asyncio.run(main())
