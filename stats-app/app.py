import streamlit as st
import numpy as np
import plotly.graph_objects as go
import scipy.stats as stats
import time

st.set_page_config(page_title="Confidence Interval Simulator", layout="wide")

col_controls, col_sample, col_plot = st.columns([1, 1.5, 2])

# ==========================================
# COLUMN 1: Controls
# ==========================================
with col_controls:
    st.markdown("### Controls")
    
    p = st.slider("Population proportion (p)", min_value=0.0, max_value=1.0, value=0.5, step=0.01)
    n = st.slider("Sample size (n)", min_value=10, max_value=100, value=12, step=1)
    
    if n * p < 10 or n * (1 - p) < 10:
        st.warning("Warning: n*p or n*(1-p) is less than 10. The normal approximation may not be perfectly accurate.")

    conf_level_str = st.selectbox("Confidence level:", ["99%", "95%", "90%", "80%"], index=1)
    conf_level = float(conf_level_str.strip('%')) / 100.0
    
    R = st.selectbox("Replicates (R)", [10, 20, 50, 100], index=1)
    simulate_clicked = st.button("Simulate", type="primary")

# ==========================================
# STATE MANAGEMENT
# ==========================================
if simulate_clicked:
    st.session_state['samples'] = np.random.binomial(n=1, p=p, size=(R, n))
    st.session_state['true_p'] = p
    st.session_state['n'] = n
    st.session_state['R'] = R
    st.session_state['animate_first_sample'] = True 

# ==========================================
# COLUMNS 2 & 3: Display and Plotting
# ==========================================
if 'samples' in st.session_state:
    samples = st.session_state['samples']
    true_p = st.session_state['true_p']
    locked_n = st.session_state['n']
    locked_R = st.session_state['R']
    
    z_score = stats.norm.ppf(1 - (1 - conf_level) / 2)
    
    # Calculate stats for all replicates
    p_hats = np.mean(samples, axis=1)
    se_all = np.sqrt(p_hats * (1 - p_hats) / locked_n)
    moe_all = z_score * se_all
    lower_bounds = p_hats - moe_all
    upper_bounds = p_hats + moe_all
    captured = (lower_bounds <= true_p) & (upper_bounds >= true_p)
    
    with col_sample:
        st.markdown("### Inspect a Sample")
        
        # New Feature: Generate a list of labels for the dropdown, appending a star to misses
        dropdown_options = []
        for i in range(locked_R):
            label = f"Replicate {i + 1}"
            if not captured[i]:
                label += " *"  # Add star if it didn't capture true p
            dropdown_options.append(label)
            
        # Dropdown selector
        selected_label = st.selectbox("Select Replicate to Inspect:", dropdown_options)
        
        # Get the index back from the selection (0-indexed)
        inspect_index = dropdown_options.index(selected_label)
        
        current_sample = samples[inspect_index]
        p_hat_current = p_hats[inspect_index]
        successes = np.sum(current_sample)
        
        dot_size = max(12, 35 - (locked_n // 4)) 
        anim_placeholder = st.empty()
        
        # Animate ONLY if it's a fresh simulation and we are looking at the first replicate
        if st.session_state.get('animate_first_sample', False) and inspect_index == 0:
            sleep_time = 1.5 / locked_n
            html_content = f"<div style='display: flex; flex-wrap: wrap; gap: 4px; width: 100%;'>"
            for i, flip in enumerate(current_sample):
                color = "red" if flip == 1 else "blue"
                html_content += f"<div style='width: {dot_size}px; height: {dot_size}px; background-color: {color}; border-radius: 50%;'></div>"
                anim_placeholder.markdown(html_content + "</div>", unsafe_allow_html=True)
                time.sleep(sleep_time)
            st.session_state['animate_first_sample'] = False
        else:
            html_content = f"<div style='display: flex; flex-wrap: wrap; gap: 4px; width: 100%;'>"
            for flip in current_sample:
                color = "red" if flip == 1 else "blue"
                html_content += f"<div style='width: {dot_size}px; height: {dot_size}px; background-color: {color}; border-radius: 50%;'></div>"
            html_content += "</div>"
            anim_placeholder.markdown(html_content, unsafe_allow_html=True)
        
        # Display the explicit calculations for the selected replicate
        st.markdown("---")
        
        # Inform the user what the star means if they selected a missed replicate
        if not captured[inspect_index]:
            st.markdown(f"**Replicate #{inspect_index + 1} Calculations:** :red[*(Did not capture $p$)*]")
        else:
            st.markdown(f"**Replicate #{inspect_index + 1} Calculations:**")
        
        # 1. Sample Proportion
        st.markdown(f"**Sample Proportion ($\hat{{p}}$):** {successes} / {locked_n}")
        st.latex(rf"\hat{{p}} = {p_hat_current:.4f}")
        
        # 2. Standard Error
        se_current = se_all[inspect_index]
        st.markdown("**Standard Error (SE):**")
        st.latex(rf"SE = \sqrt{{\frac{{\hat{{p}}(1-\hat{{p}})}}{{n}}}} = \sqrt{{\frac{{{p_hat_current:.4f}(1-{p_hat_current:.4f})}}{{{locked_n}}}}} = {se_current:.4f}")
        
        # 3. Margin of Error
        moe_current = moe_all[inspect_index]
        # Fixed: Used 'rf' (raw string) to properly escape the \approx command for LaTeX
        st.markdown(rf"**Margin of Error (MOE) at {conf_level_str} ($z^* \approx {z_score:.3f}$):**")
        st.latex(rf"MOE = z^* \times SE = {z_score:.3f} \times {se_current:.4f} = {moe_current:.4f}")
        
        # 4. Interval Bounds (Removed the formula, colored dark red if missed)
        st.markdown("**Confidence Interval:**")
        if captured[inspect_index]:
            st.latex(rf"({lower_bounds[inspect_index]:.4f},\; {upper_bounds[inspect_index]:.4f})")
        else:
            # Highlight the interval in dark red using LaTeX formatting
            st.latex(rf"\color{{#8B0000}} ({lower_bounds[inspect_index]:.4f},\; {upper_bounds[inspect_index]:.4f})")

    with col_plot:
        st.markdown("### Confidence Intervals")
        capture_rate = np.mean(captured)
        
        fig = go.Figure()
        fig.add_vline(x=true_p, line_dash="dash", line_color="black")
        
        for i in range(locked_R):
            # Highlight the currently inspected replicate in bright orange
            is_inspected = (i == inspect_index)
            
            if is_inspected:
                interval_color = "#FF8C00" # Orange for the selected one
                line_width = 4
                opacity = 1.0
            else:
                interval_color = "#333333" if captured[i] else "red"
                line_width = 2
                opacity = 0.4 if not is_inspected else 1.0 # Fade the others slightly
            
            fig.add_trace(go.Scatter(
                x=[lower_bounds[i], upper_bounds[i]],
                y=[i, i],
                mode="lines",
                line=dict(color=interval_color, width=line_width),
                opacity=opacity,
                showlegend=False,
                hoverinfo="skip"
            ))
            
            fig.add_trace(go.Scatter(
                x=[p_hats[i]],
                y=[i],
                mode="markers",
                marker=dict(color=interval_color, size=8 if is_inspected else 6),
                opacity=opacity,
                showlegend=False,
                hovertemplate=f"Rep {i+1}<br>p-hat: {p_hats[i]:.3f}<br>Interval: [{lower_bounds[i]:.3f}, {upper_bounds[i]:.3f}]<extra></extra>"
            ))
            
        fig.update_layout(
            xaxis=dict(title="Proportion", range=[0, 1], tickvals=[0, 0.2, 0.4, 0.6, 0.8, 1.0]),
            yaxis=dict(showticklabels=False, range=[-1, locked_R]), 
            height=600, 
            margin=dict(l=20, r=20, t=20, b=20)
        )
        
        st.plotly_chart(fig, use_container_width=True)
        
        st.markdown(f"**Replicates that captured true $p$:** {np.sum(captured)} / {locked_R}")
        st.markdown(f"**Capture Rate:** <span style='color:green; font-size:1.2em;'>{capture_rate*100:.1f}%</span>", unsafe_allow_html=True)