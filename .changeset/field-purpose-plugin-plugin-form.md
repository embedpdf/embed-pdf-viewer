---
'@embedpdf/plugin-form': minor
---

Fields say what they are for, and dates work without JavaScript.

- Each box of `listWidgets()` has its field's `purpose` and `format`, and a `placeholder`: the label of the purpose while a text field, a dropdown or a signature field is empty, and a signature box holds no drawn mark. Its color is the new `fields.placeholder` setting.
- `form.prefill()` writes the user's name, email address, organization and job title into their own empty fields by purpose, and today's date into a `date-signed` field (in its date pattern, else `yyyy-mm-dd`), as one change and one step to undo. It resolves what it wrote and what it left, with the reason. A date field read with JavaScript off takes today from `ctx.clock` too.
- New field tools place a text field with a purpose: `form-name`, `form-email`, `form-organization`, `form-organization-title` and `form-date-signed` (a read-only date field). `formPlugin({ tools })` changes a field tool or adds your own from an existing one: `{ id, extends, field, defaults, clickCreate }`.
- `getFieldSettings()` describes a field's `purpose` (a choice; `listPurposes()` has the labels) and, for a text field and a dropdown, its `format` (a new `format` control with the kinds and Acrobat's patterns).
- With JavaScript off, what is typed into a date or a time field is still checked against the field's pattern and shown the way the pattern writes it, as the field's own scripts do. Before, such a field took any text. `validation: 'none'` still accepts everything.
- `formatDate()`, `parseDate()`, `isDatePattern()`, `isTimePattern()`, `STANDARD_DATE_PATTERNS` and `STANDARD_TIME_PATTERNS` are exported for a date picker of your own.
- With the i18n plugin, a purpose's label is in the viewer's language, and so is the day of signing's `hint`, "Filled in when you sign", which a box gives the person whose date it is.
- One tint per field, the viewer's paint, never saved: a box's `accent` is its group's color, else the new `fields.tintColor` (`null`, off, by default), and a box says whether it's `yours` to fill in. A box that isn't yours (another person's field, a read-only one, a signed signature) has no accent and no placeholder. In design mode a lent field with no border of its own and no tint gets an outline in `fields.border`, and a field tool's ghost is the field it places: its look, its tint, its outline and its placeholder.
- Who a field is for is its `assignment`: a group, anyone or nobody. `setDesignAssignment()` and `getDesignAssignment()` say who fields placed with a tool are for (the state's `designAssignment`; `onDesignGroupChanged` carries `assignment`), `assign()` gives fields an assignment as one step to undo, and `canAssign()` says whether the user may give one: anyone takes `fields:set-group:all`. `setDesignGroup()`, `getDesignGroup()` and `moveToGroup()` stay, as the shorthand for a group or nobody. `getFieldSettings()` describes an `assignment` setting (a new `assignment` control) beside `groupId`.
- A field anyone fills in shows in the new `fields.anyoneTintColor` (`'#0891b2'`), read as "Anyone" after its name, in the viewer's language. The signature tool places nothing while fields are placed for anyone, and `prefill()` leaves such a field (`'for-anyone'`).
- A box is `yours` only while it takes input: the `fillable` setting counts too, so a box it leaves out has no tint and no placeholder, and neither has a field a signature locked.

`FORM_TOOLS` and the tools the annotation plugin lists have five more entries, so a palette drawn from either shows five more tools.
