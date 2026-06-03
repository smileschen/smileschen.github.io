"""
Titanic Data Dashboard
----------------------
A Streamlit app for exploring survival outcomes in the Titanic data set.

Features:
- Load Titanic data from a public CSV URL.
- Select one or two explanatory variables using dropdown menus.
- Display counts of passengers who survived and died.
- Display row percentages so survived + died = 100% for each row.
- Show a side-by-side or stacked relative-frequency bar chart.
- Optionally filter out missing values.
- Download the summary table as a CSV file.

To run locally:
    streamlit run titanic_streamlit_dashboard.py

Suggested requirements.txt:
    streamlit
    pandas
    plotly
"""

from __future__ import annotations

import pandas as pd
import plotly.express as px
import streamlit as st


# ---------------------------------------------------------------------
# Page setup
# ---------------------------------------------------------------------

st.set_page_config(
    page_title="Titanic Data Dashboard",
    page_icon="🚢",
    layout="wide",
)


# ---------------------------------------------------------------------
# Data loading
# ---------------------------------------------------------------------

@st.cache_data
def load_titanic_data() -> pd.DataFrame:
    """Load and lightly clean the Titanic data set.

    This version uses a public CSV copy of the Titanic training data.
    The 'Survived' column is recoded as 'Survived' / 'Died'.
    The 'Pclass' column is recoded as 1st / 2nd / 3rd class.

    Returns
    -------
    pd.DataFrame
        Cleaned Titanic data.
    """

    url = "https://raw.githubusercontent.com/datasciencedojo/datasets/master/titanic.csv"
    df = pd.read_csv(url)

    # Standardize names to friendlier, lower-case variable names.
    df = df.rename(
        columns={
            "PassengerId": "passenger_id",
            "Survived": "survived",
            "Pclass": "class",
            "Name": "name",
            "Sex": "sex",
            "Age": "age",
            "SibSp": "siblings_spouses",
            "Parch": "parents_children",
            "Ticket": "ticket",
            "Fare": "fare",
            "Cabin": "cabin",
            "Embarked": "embarked",
        }
    )

    # Create the outcome label.
    df["outcome"] = df["survived"].map({1: "Survived", 0: "Died"})

    # Give class values friendlier labels and a meaningful order.
    class_map = {1: "1st", 2: "2nd", 3: "3rd"}
    df["class"] = df["class"].map(class_map)

    # Give embarkation values friendlier labels.
    embarked_map = {
        "C": "Cherbourg",
        "Q": "Queenstown",
        "S": "Southampton",
    }
    df["embarked"] = df["embarked"].map(embarked_map)

    # Create a few useful categorical variables from numerical variables.
    df["age_group"] = pd.cut(
        df["age"],
        bins=[0, 12, 18, 35, 60, 100],
        labels=["Child", "Teen", "Young adult", "Adult", "Senior"],
        include_lowest=True,
    )

    df["fare_group"] = pd.qcut(
        df["fare"],
        q=4,
        labels=["Lowest fare", "Lower-mid fare", "Upper-mid fare", "Highest fare"],
        duplicates="drop",
    )

    df["family_size"] = df["siblings_spouses"] + df["parents_children"] + 1
    df["traveling_alone"] = df["family_size"].apply(
        lambda x: "Alone" if x == 1 else "With family"
    )

    return df


def make_summary_table(
    df: pd.DataFrame,
    row_vars: list[str],
    outcome_col: str = "outcome",
) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Create a summary table of counts and row percentages.

    The table is summarized by the selected row variables. For each row,
    the survival and death proportions add to 100%.

    Parameters
    ----------
    df:
        Data set to summarize.
    row_vars:
        Variables selected by the user. These define the rows of the table.
    outcome_col:
        Outcome column. Defaults to 'outcome'.

    Returns
    -------
    tuple[pd.DataFrame, pd.DataFrame]
        wide_table:
            A display-friendly table with counts and percentages.
        long_table:
            Long-format table used for the bar chart.
    """

    # Count passengers in each group and outcome.
    counts = (
        df.groupby(row_vars + [outcome_col], observed=True)
        .size()
        .reset_index(name="count")
    )

    # Add row totals and percentages within each selected group.
    counts["row_total"] = counts.groupby(row_vars, observed=True)["count"].transform("sum")
    counts["percent"] = counts["count"] / counts["row_total"] * 100

    # Make sure both outcome categories appear as columns when possible.
    wide_counts = counts.pivot_table(
        index=row_vars,
        columns=outcome_col,
        values="count",
        fill_value=0,
        observed=True,
    )

    wide_percent = counts.pivot_table(
        index=row_vars,
        columns=outcome_col,
        values="percent",
        fill_value=0,
        observed=True,
    )

    # Put columns in a consistent order.
    outcome_order = ["Survived", "Died"]
    for outcome in outcome_order:
        if outcome not in wide_counts.columns:
            wide_counts[outcome] = 0
        if outcome not in wide_percent.columns:
            wide_percent[outcome] = 0

    wide_counts = wide_counts[outcome_order]
    wide_percent = wide_percent[outcome_order]

    # Combine counts and percentages into one display table.
    wide_table = pd.DataFrame(index=wide_counts.index)
    wide_table["Total"] = wide_counts.sum(axis=1).astype(int)

    for outcome in outcome_order:
        wide_table[f"{outcome} count"] = wide_counts[outcome].astype(int)
        wide_table[f"{outcome} %"] = wide_percent[outcome].round(1)

    wide_table = wide_table.reset_index()

    # Create a label for the bar chart x-axis.
    if len(row_vars) == 1:
        counts["group_label"] = counts[row_vars[0]].astype(str)
    else:
        counts["group_label"] = counts[row_vars].astype(str).agg(" | ".join, axis=1)

    counts["percent"] = counts["percent"].round(1)

    return wide_table, counts


def format_display_table(table: pd.DataFrame) -> pd.io.formats.style.Styler:
    """Format the summary table for display in Streamlit."""

    percent_cols = [col for col in table.columns if col.endswith("%")]
    count_cols = [col for col in table.columns if col.endswith("count") or col == "Total"]

    format_dict = {col: "{:.1f}%" for col in percent_cols}
    format_dict.update({col: "{:,.0f}" for col in count_cols})

    return table.style.format(format_dict)


# ---------------------------------------------------------------------
# Main app
# ---------------------------------------------------------------------

st.title("🚢 Titanic Data Dashboard")
st.write(
    "Select one or two categorical variables. The table and bar chart show "
    "survival outcomes within each row group. For each row, the Survived % "
    "and Died % add to 100%."
)

try:
    titanic = load_titanic_data()
except Exception as err:
    st.error(
        "The Titanic data could not be loaded. Check your internet connection "
        "or replace the URL in load_titanic_data() with a local CSV file."
    )
    st.exception(err)
    st.stop()


# Variables that work well as categorical grouping variables.
VARIABLE_OPTIONS = {
    "Sex": "sex",
    "Passenger class": "class",
    "Embarked from": "embarked",
    "Age group": "age_group",
    "Fare group": "fare_group",
    "Traveling alone": "traveling_alone",
}

st.sidebar.header("Dashboard controls")

primary_label = st.sidebar.selectbox(
    "First variable",
    options=list(VARIABLE_OPTIONS.keys()),
    index=0,
)

secondary_options = ["None"] + [
    label for label in VARIABLE_OPTIONS.keys() if label != primary_label
]

secondary_label = st.sidebar.selectbox(
    "Second variable",
    options=secondary_options,
    index=1 if "Passenger class" in secondary_options else 0,
)

chart_type = st.sidebar.radio(
    "Bar chart type",
    options=["Side-by-side", "Stacked"],
    index=0,
)

drop_missing = st.sidebar.checkbox(
    "Remove rows with missing selected values",
    value=True,
)

show_raw_data = st.sidebar.checkbox(
    "Show raw data preview",
    value=False,
)


# Convert the selected labels to actual column names.
selected_vars = [VARIABLE_OPTIONS[primary_label]]

if secondary_label != "None":
    selected_vars.append(VARIABLE_OPTIONS[secondary_label])


# Keep only rows that have outcome and selected-variable values.
dashboard_data = titanic.copy()

if drop_missing:
    dashboard_data = dashboard_data.dropna(subset=selected_vars + ["outcome"])
else:
    for col in selected_vars:
        dashboard_data[col] = dashboard_data[col].astype("object").where(
            dashboard_data[col].notna(), "Missing"
        )


summary_table, chart_data = make_summary_table(dashboard_data, selected_vars)


# ---------------------------------------------------------------------
# Display summary stats
# ---------------------------------------------------------------------

metric_col1, metric_col2, metric_col3 = st.columns(3)

with metric_col1:
    st.metric("Passengers shown", f"{len(dashboard_data):,}")

with metric_col2:
    survived_count = int((dashboard_data["outcome"] == "Survived").sum())
    st.metric("Survived", f"{survived_count:,}")

with metric_col3:
    died_count = int((dashboard_data["outcome"] == "Died").sum())
    st.metric("Died", f"{died_count:,}")


# ---------------------------------------------------------------------
# Table and chart layout
# ---------------------------------------------------------------------

left_col, right_col = st.columns([1.05, 1.35], gap="large")

with left_col:
    st.subheader("Summary table")

    st.dataframe(
        format_display_table(summary_table),
        use_container_width=True,
        hide_index=True,
    )

    csv = summary_table.to_csv(index=False).encode("utf-8")

    st.download_button(
        label="Download summary table as CSV",
        data=csv,
        file_name="titanic_survival_summary.csv",
        mime="text/csv",
    )

with right_col:
    st.subheader("Relative-frequency bar chart")

    barmode = "group" if chart_type == "Side-by-side" else "stack"

    fig = px.bar(
        chart_data,
        x="group_label",
        y="percent",
        color="outcome",
        barmode=barmode,
        text="percent",
        category_orders={"outcome": ["Survived", "Died"]},
        labels={
            "group_label": "Selected group",
            "percent": "Percent within row group",
            "outcome": "Outcome",
        },
        title="Survival outcome percentages by selected group",
    )

    fig.update_traces(
        texttemplate="%{text:.1f}%",
        textposition="outside" if barmode == "group" else "inside",
    )

    fig.update_layout(
        yaxis=dict(range=[0, 100], ticksuffix="%"),
        xaxis_title=None,
        legend_title_text="Outcome",
        margin=dict(l=10, r=10, t=60, b=90),
    )

    st.plotly_chart(fig, use_container_width=True)


# ---------------------------------------------------------------------
# Optional raw data preview
# ---------------------------------------------------------------------

if show_raw_data:
    st.subheader("Raw data preview")
    st.dataframe(titanic.head(50), use_container_width=True, hide_index=True)


# ---------------------------------------------------------------------
# Notes for students/users
# ---------------------------------------------------------------------

with st.expander("How to read this dashboard"):
    st.markdown(
        """
        - The **count columns** show how many passengers in each selected group survived or died.
        - The **percentage columns** show the row percentages.
        - For each row, **Survived % + Died % = 100%**.
        - The bar chart uses the same row percentages as the table.
        - Use the chart type control to switch between **side-by-side** bars and **stacked** bars.
        """
    )
