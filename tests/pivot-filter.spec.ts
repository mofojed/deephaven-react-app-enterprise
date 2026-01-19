import { test, expect } from "@playwright/test";

test.describe("Pivot Table Selection Filter", () => {
  test("selecting a row in the pivot table should filter the source table", async ({
    page,
  }) => {
    // Navigate to the pivot table page
    await page.goto("/?queryName=pivots&tableName=fish_market_pivot");

    // Wait for the AG Grid tables to load - there should be two grids
    const grids = page.locator(".ag-root-wrapper");
    await expect(grids).toHaveCount(2, { timeout: 30000 });

    // Wait for both grids to have data loaded
    const leftGrid = grids.nth(0);
    const rightGrid = grids.nth(1);

    // Wait for rows to appear in both grids
    await expect(leftGrid.locator(".ag-row")).not.toHaveCount(0, {
      timeout: 30000,
    });
    await expect(rightGrid.locator(".ag-row")).not.toHaveCount(0, {
      timeout: 30000,
    });

    // Get the text content of all cells in the first row of the pivot table
    // This will help us understand what value we're selecting
    const firstPivotRow = leftGrid.locator(".ag-row").first();
    const firstRowText = await firstPivotRow.textContent();
    console.log(`First pivot row content: ${firstRowText}`);

    // Get the initial content of the source table to compare later
    const sourceTableContent = await rightGrid.textContent();
    console.log(
      `Initial source table content length: ${sourceTableContent?.length}`,
    );

    // Click the checkbox to select the first row
    const firstRowCheckbox = firstPivotRow.locator(".ag-selection-checkbox");
    if ((await firstRowCheckbox.count()) > 0) {
      await firstRowCheckbox.click();
      console.log("Clicked checkbox on first pivot row");
    }

    // Wait for the filter to apply
    await page.waitForTimeout(2000);

    // Get the new content of the source table
    const filteredSourceTableContent = await rightGrid.textContent();
    console.log(
      `Filtered source table content length: ${filteredSourceTableContent?.length}`,
    );

    // The content should have changed (either different content or different length)
    // since we've filtered the data
    const contentChanged = sourceTableContent !== filteredSourceTableContent;
    console.log(`Source table content changed: ${contentChanged}`);

    // Verify the filter was applied by checking that the source table content changed
    expect(contentChanged).toBe(true);
  });
});
