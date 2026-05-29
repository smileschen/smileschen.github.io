import numpy as np
import pandas as pd
import plotly.graph_objects as go
import streamlit as st

st.set_page_config(
    page_title="Least Squares Explorer",
    page_icon="📈",
    layout="wide",
)

# -----------------------------
# Helpers
# -----------------------------

def _coerce_data(df: pd.DataFrame) -> pd.DataFrame:
    """Keep only numeric x/y rows and return a clean data frame."""
    out = df.copy()
    out["x"] = pd.to_numeric(out["x"], errors="coerce")
    out["y"] = pd.to_numeric(out["y"], errors="coerce")
    out = out.dropna(subset=["x", "y"]).reset_index(drop=True)
    return out


def _ols_solution(df: pd.DataFrame) -> tuple[float, float]:
    """Return least-squares intercept and slope for y = b0 + b1*x."""
    x = df["x"].to_numpy(dtype=float)
    y = df["y"].to_numpy(dtype=float)

    if len(df) < 2 or np.isclose(np.var(x), 0):
        return np.nan, np.nan

    slope = np.sum((x - x.mean()) * (y - y.mean())) / np.sum((x - x.mean()) ** 2)
    intercept = y.mean() - slope * x.mean()
    return float(intercept), float(slope)


def _results_table(df: pd.DataFrame, intercept: float, slope: float) -> pd.DataFrame:
    out = df.copy()
    out["y-hat"] = intercept + slope * out["x"]
    out["e = y - y-hat"] = out["y"] - out["y-hat"]
    out["(y - y-hat)^2"] = out["e = y - y-hat"] ** 2
    return out


def _plot_least_squares(df: pd.DataFrame, results: pd.DataFrame, intercept: float, slope: float) -> go.Figure:
    x = df["x"].to_numpy(dtype=float)
    y = df["y"].to_numpy(dtype=float)
    yhat = results["y-hat"].to_numpy(dtype=float)
    residuals = results["e = y - y-hat"].to_numpy(dtype=float)
    squared = results["(y - y-hat)^2"].to_numpy(dtype=float)

    if len(df) == 0:
        return go.Figure()

    # --- Compute how far squares extend left/right so the axis limits can include them ---
    left_extensions = []
    right_extensions = []

    for xi, ei in zip(x, residuals):
        side = abs(ei)
        if ei > 0:
            # positive residual -> square faces left
            left_extensions.append(xi - side)
            right_extensions.append(xi)
        elif ei < 0:
            # negative residual -> square faces right
            left_extensions.append(xi)
            right_extensions.append(xi + side)
        else:
            left_extensions.append(xi)
            right_extensions.append(xi)

    x_min_data = min(np.min(x), np.min(left_extensions))
    x_max_data = max(np.max(x), np.max(right_extensions))
    y_min_data = min(np.min(y), np.min(yhat))
    y_max_data = max(np.max(y), np.max(yhat))

    x_pad = max(1.0, 0.15 * (x_max_data - x_min_data))
    y_pad = max(1.0, 0.15 * (y_max_data - y_min_data))

    x_min = x_min_data - x_pad
    x_max = x_max_data + x_pad
    y_min = y_min_data - y_pad
    y_max = y_max_data + y_pad

    line_x = np.array([x_min, x_max])
    line_y = intercept + slope * line_x

    fig = go.Figure()

    # Fitted line
    fig.add_trace(
        go.Scatter(
            x=line_x,
            y=line_y,
            mode="lines",
            name="Current fitted line",
            line=dict(width=3),
            hovertemplate="x=%{x:.2f}<br>ŷ=%{y:.2f}<extra></extra>",
        )
    )

    shapes = []
    annotations = []

    for i, (xi, yi, yhi, ei, sqi) in enumerate(zip(x, y, yhat, residuals, squared)):
        is_first_residual = i == 0

        # Residual segment
        fig.add_trace(
            go.Scatter(
                x=[xi, xi],
                y=[yhi, yi],
                mode="lines",
                name="Residual",
                showlegend=is_first_residual,
                line=dict(width=2, dash="dot"),
                hovertemplate=(
                    f"x={xi:.2f}<br>y={yi:.2f}<br>ŷ={yhi:.2f}<br>"
                    f"e={ei:.2f}<br>e²={sqi:.2f}<extra></extra>"
                ),
            )
        )

        side = abs(ei)

        if side > 1e-9:
            y0 = min(yi, yhi)
            y1 = max(yi, yhi)

            if ei > 0:
                # Positive residual: square faces LEFT, residual is the RIGHT edge
                x0 = xi - side
                x1 = xi
            else:
                # Negative residual: square faces RIGHT, residual is the LEFT edge
                x0 = xi
                x1 = xi + side

            shapes.append(
                dict(
                    type="rect",
                    x0=x0,
                    x1=x1,
                    y0=y0,
                    y1=y1,
                    line=dict(width=1),
                    fillcolor="rgba(150, 150, 150, 0.22)",
                )
            )

            annotations.append(
                dict(
                    x=(x0 + x1) / 2,
                    y=(y0 + y1) / 2,
                    text=f"e={ei:.2f}<br>e²={sqi:.2f}",
                    showarrow=False,
                    font=dict(size=11),
                    bgcolor="rgba(255,255,255,0.72)",
                    bordercolor="rgba(0,0,0,0.25)",
                    borderwidth=1,
                )
            )
        else:
            annotations.append(
                dict(
                    x=xi,
                    y=yi,
                    text="e=0<br>e²=0",
                    showarrow=True,
                    arrowhead=2,
                    ax=25,
                    ay=-25,
                    font=dict(size=11),
                    bgcolor="rgba(255,255,255,0.72)",
                )
            )

    # Actual data points
    fig.add_trace(
        go.Scatter(
            x=x,
            y=y,
            mode="markers",
            name="Data",
            marker=dict(size=12),
            hovertemplate="x=%{x:.2f}<br>y=%{y:.2f}<extra></extra>",
        )
    )

    # Predicted points
    fig.add_trace(
        go.Scatter(
            x=x,
            y=yhat,
            mode="markers",
            name="Predicted values",
            marker=dict(size=9, symbol="x"),
            hovertemplate="x=%{x:.2f}<br>ŷ=%{y:.2f}<extra></extra>",
        )
    )

    fig.update_layout(
        title=f"Current line: ŷ = {intercept:.2f} + {slope:.2f}x",
        xaxis_title="x",
        yaxis_title="y",
        height=560,
        margin=dict(l=20, r=20, t=60, b=20),
        legend=dict(orientation="h", yanchor="bottom", y=1.02, xanchor="left", x=0),
        shapes=shapes,
        annotations=annotations,
    )

    # Set visible ranges
    fig.update_xaxes(range=[x_min, x_max], zeroline=True)
    fig.update_yaxes(
        range=[y_min, y_max],
        zeroline=True,
        scaleanchor="x",   # <- same scale as x-axis
        scaleratio=1       # <- 1 unit on x equals 1 unit on y
    )

    return fig
    

def _nudge_value(key: str, amount: float) -> None:
    st.session_state[key] = round(float(st.session_state.get(key, 0.0)) + amount, 3)


def _parameter_control(label: str, key: str, min_value: float, max_value: float, step: float, help_text: str):
    st.markdown(f"### {label}")
    st.slider(
        label,
        min_value=min_value,
        max_value=max_value,
        step=step,
        key=key,
        label_visibility="collapsed",
        help=help_text,
    )
    minus_col, value_col, plus_col = st.columns([1, 2, 1])
    with minus_col:
        st.button("−", key=f"{key}_minus", on_click=_nudge_value, args=(key, -step), width="stretch")
    with value_col:
        st.metric(label, f"{st.session_state[key]:.2f}")
    with plus_col:
        st.button("+", key=f"{key}_plus", on_click=_nudge_value, args=(key, step), width="stretch")


# -----------------------------
# Session-state defaults
# -----------------------------

if "intercept" not in st.session_state:
    st.session_state.intercept = 0.0

if "slope" not in st.session_state:
    st.session_state.slope = 1.0

if "submitted" not in st.session_state:
    st.session_state.submitted = None

if "show_solution" not in st.session_state:
    st.session_state.show_solution = False

if "data" not in st.session_state:
    st.session_state.data = pd.DataFrame({"x": [1, 2, 3, 4], "y": [2, 6, 4, 8]})


# -----------------------------
# App
# -----------------------------

st.title("Least Squares Regression Explorer")

st.markdown(
    """
    Try to find the line that best fits the data. Edit the x and y values on the left, then adjust the
    intercept and slope. The graph, residual squares, residual table, and total sum of squared residuals
    update as you work. Your goal is to make the total sum of squares as small as possible before you
    submit your best answer.
    """
)

left, right = st.columns([0.35, 0.65], gap="large")

with left:
    st.subheader("Input data")
    edited = st.data_editor(
        st.session_state.data,
        num_rows="dynamic",
        width="stretch",
        column_config={
            "x": st.column_config.NumberColumn("x", step=0.5, format="%.3f"),
            "y": st.column_config.NumberColumn("y", step=0.5, format="%.3f"),
        },
        hide_index=True,
        key="data_editor",
    )
    data = _coerce_data(edited)
    st.session_state.data = data

    if len(data) < 2:
        st.warning("Enter at least two complete numeric points.")
        st.stop()
    if np.isclose(data["x"].var(ddof=0), 0):
        st.warning("The x values cannot all be the same for ordinary least-squares regression.")
        st.stop()

    st.divider()
    st.subheader("Adjust your line")

    _parameter_control(
        "Intercept",
        "intercept",
        min_value=-10.0,
        max_value=10.0,
        step=0.1,
        help_text="The intercept is the predicted y-value when x = 0.",
    )

    _parameter_control(
        "Slope",
        "slope",
        min_value=-10.0,
        max_value=10.0,
        step=0.1,
        help_text="The slope is the change in predicted y for a one-unit increase in x.",
    )

    st.caption("Use the slider for big changes and the +/− buttons for fine tuning.")

    st.divider()
    submit_col, reveal_col = st.columns(2)

    with submit_col:
        if st.button("Submit my best", type="primary", width="stretch"):
            st.session_state.submitted = {
                "intercept": float(st.session_state.intercept),
                "slope": float(st.session_state.slope),
            }
            st.success("Submitted! Now reveal the optimal solution when you are ready.")

    with reveal_col:
        if st.button("Reveal optimal solution", width="stretch"):
            st.session_state.show_solution = True

    opt_intercept, opt_slope = _ols_solution(data)

    if st.session_state.show_solution:
        current_results = _results_table(data, st.session_state.intercept, st.session_state.slope)
        optimal_results = _results_table(data, opt_intercept, opt_slope)
        current_ss = float(current_results["(y - y-hat)^2"].sum())
        optimal_ss = float(optimal_results["(y - y-hat)^2"].sum())

        st.info(
            f"Optimal line: ŷ = {opt_intercept:.3f} + {opt_slope:.3f}x\n\n"
            f"Minimum sum of squares: {optimal_ss:.3f}"
        )

        if st.session_state.submitted is not None:
            submitted_results = _results_table(
                data,
                st.session_state.submitted["intercept"],
                st.session_state.submitted["slope"],
            )
            submitted_ss = float(submitted_results["(y - y-hat)^2"].sum())
            excess = submitted_ss - optimal_ss
            pct_over = 100 * excess / optimal_ss if optimal_ss > 0 else 0
            st.write(
                f"Your submitted line was ŷ = {st.session_state.submitted['intercept']:.3f} "
                f"+ {st.session_state.submitted['slope']:.3f}x. "
                f"Its sum of squares was {submitted_ss:.3f}, which is {excess:.3f} above the minimum"
                f" ({pct_over:.1f}% higher)."
            )
        else:
            st.write("Submit your best answer first if you want a comparison against the optimum.")

    st.divider()
    with st.expander("Deployment notes"):
        st.code("pip install streamlit pandas numpy plotly", language="bash")
        st.code("streamlit run app.py", language="bash")


with right:
    results = _results_table(data, st.session_state.intercept, st.session_state.slope)
    ss_total = float(results["(y - y-hat)^2"].sum())

    st.plotly_chart(
        _plot_least_squares(data, results, st.session_state.intercept, st.session_state.slope),
        width="stretch",
    )

    metric_col1, metric_col2, metric_col3 = st.columns(3)
    metric_col1.metric("Current intercept", f"{st.session_state.intercept:.2f}")
    metric_col2.metric("Current slope", f"{st.session_state.slope:.2f}")
    metric_col3.metric("Total Sum of Squares", f"{ss_total:.3f}")

    st.subheader("Residual calculations")
    display_results = results.copy()
    for col in ["x", "y", "y-hat", "e = y - y-hat", "(y - y-hat)^2"]:
        display_results[col] = display_results[col].astype(float).round(3)

    st.dataframe(
        display_results[["x", "y", "y-hat", "e = y - y-hat", "(y - y-hat)^2"]],
        hide_index=True,
        width="stretch",
    )

    st.latex(
        r"\text{Total SS} = \sum_i (y_i - \hat{y}_i)^2 = " + f"{ss_total:.3f}"
    )
