import streamlit as st
import numpy as np
import plotly.graph_objects as go
import scipy.stats as stats
import time

# Set the page to be wide so we have room for our 3 columns
st.set_page_config(page_title="Confidence Interval Simulator", layout="wide")

# 1. Define the Layout Columns
col_controls, col_sample, col_plot = st.columns([1, 1.5, 2])

# ==========================================
# COLUMN 1: Controls
# ==========================================
with col_controls:
    st.markdown("### Controls")
    
    # Population Proportion Slider
    p = st.slider("Population proportion (p)", min_value=0.0, max_value=1.0, value=0.5, step=0.01)
    
    # Sample Size Slider
    n = st.slider("Sample size (n)", min_value=10, max_value=100, value=12, step=1)
    
    # Check assumption for Normal Approximation
    if n * p < 10 or n * (1 - p) < 10:
        st.warning("Warning: n*p or n*(1-p) is less than 10. The normal approximation for the confidence interval may not be perfectly accurate.")

    # Confidence Level Dropdown
    conf_level_str = st.selectbox("Confidence level:", ["99%", "95%", "90%", "80%"], index=1)
    # Convert string percentage to a decimal (e.g., "95%" -> 0.95)
    conf_level = float(conf_level_str.strip('%')) / 100.0
    
    # Replicates Dropdown
    R = st.selectbox("Replicates (R)", [10, 20, 50, 100], index=1)
    
    # Simulate Button
    simulate_clicked = st.button("Simulate", type="primary")

# ==========================================
# STATE MANAGEMENT
# ==========================================
# If the user clicks simulate, we generate the data and flag that we need to animate
if simulate_clicked:
    # Generate R rows of n coin flips (1 for heads/red, 0 for tails/blue)
    st.session_state['samples'] = np.random.binomial(n=1, p=p, size=(R, n))
    st.session_state['true_p'] = p
    st.session_state['n'] = n
    st.session_state['R'] = R
    # Set animation flag so the coin flips animate once per simulation click
    st.session_state['animate_first_sample'] = True 

# ==========================================
# COLUMNS 2 & 3: Display and Plotting
# ==========================================
# Only execute this part if we have data in our session state
if 'samples' in st.session_state:
    
    # Retrieve the locked data from state
    samples = st.session_state['samples']
    true_p = st.session_state['true_p']
    locked_n = st.session_state['n']
    locked_R = st.session_state['R']
    
    # Calculate the z-score based on the dynamically selected confidence level
    # This recalculates instantly when the user changes the dropdown!
    z_score = stats.norm.ppf(1 - (1 - conf_level) / 2)
    
    with col_sample:
        st.markdown("### Random Sample")
        # Isolate the very first sample to visualize as "coin flips"
        first_sample = samples[0]
        
        # Calculate dynamic size: if n is small, dots are large. If n=100, dots are smaller to fit 4 lines.
        # We use a CSS flexbox to automatically wrap the dots.
        dot_size = max(12, 35 - (locked_n // 4)) 
        
        # A placeholder for our animation
        anim_placeholder = st.empty()
        
        # Check if we need to animate (only true right after clicking 'Simulate')
        if st.session_state.get('animate_first_sample', False):
            # Calculate sleep time to ensure the whole animation takes about 1.5 seconds
            sleep_time = 1.5 / locked_n
            
            html_content = f"<div style='display: flex; flex-wrap: wrap; gap: 4px; width: 100%;'>"
            
            for i, flip in enumerate(first_sample):
                color = "red" if flip == 1 else "blue"
                html_content += f"<div style='width: {dot_size}px; height: {dot_size}px; background-color: {color}; border-radius: 50%;'></div>"
                
                # Update the placeholder rapidly
                anim_placeholder.markdown(html_content + "</div>", unsafe_allow_html=True)
                time.sleep(sleep_time)
                
            # Turn off animation so it doesn't replay if we just change the confidence level later
            st.session_state['animate_first_sample'] = False
        else:
            # If not animating (e.g., user just changed the confidence dropdown), draw them all instantly
            html_content = f"<div style='display: flex; flex-wrap: wrap; gap: 4px; width: 100%;'>"
            for flip in first_sample:
                color = "red" if flip == 1 else "blue"
                html_content += f"<div style='width: {dot_size}px; height: {dot_size}px; background-color: {color}; border-radius: 50%;'></div>"
            html_content += "</div>"
            anim_placeholder.markdown(html_content, unsafe_allow_html=True)
        
        # Calculate and display the sample proportion for the first sample
        p_hat_first = np.mean(first_sample)
        successes = np.sum(first_sample)
        st.markdown(f"**x = {successes}**")
        st.markdown(f"**$\hat{{p}}$ = {successes}/{locked_n} = {p_hat_first:.4f}**")


    with col_plot:
        st.markdown("### Confidence Intervals")
        
        # 1. Calculate sample proportions (p-hats) for ALL R replicates simultaneously
        p_hats = np.mean(samples, axis=1)
        
        # 2. Calculate the margin of error for each replicate
        # standard error = sqrt( p_hat * (1 - p_hat) / n )
        # To avoid division by zero errors if p_hat is exactly 0 or 1, we ensure standard error is handled safely
        se = np.sqrt(p_hats * (1 - p_hats) / locked_n)
        margin_of_error = z_score * se
        
        # 3. Calculate lower and upper bounds
        lower_bounds = p_hats - margin_of_error
        upper_bounds = p_hats + margin_of_error
        
        # 4. Check which intervals successfully captured the true population proportion p
        captured = (lower_bounds <= true_p) & (upper_bounds >= true_p)
        capture_rate = np.mean(captured)
        
        # 5. Build the Plotly Figure
        fig = go.Figure()
        
        # Add the vertical dashed line for the true population proportion
        fig.add_vline(x=true_p, line_dash="dash", line_color="black")
        
        # Draw each of the R confidence intervals
        for i in range(locked_R):
            # Color is black/gray if it captured the true p, red if it missed!
            interval_color = "#333333" if captured[i] else "red"
            
            # Add the horizontal line for the interval
            fig.add_trace(go.Scatter(
                x=[lower_bounds[i], upper_bounds[i]],
                y=[i, i],
                mode="lines",
                line=dict(color=interval_color, width=2),
                showlegend=False,
                hoverinfo="skip"
            ))
            
            # Add the dot in the middle representing p-hat
            fig.add_trace(go.Scatter(
                x=[p_hats[i]],
                y=[i],
                mode="markers",
                marker=dict(color=interval_color, size=6),
                showlegend=False,
                hovertemplate=f"Rep {i+1}<br>p-hat: {p_hats[i]:.3f}<br>Interval: [{lower_bounds[i]:.3f}, {upper_bounds[i]:.3f}]<extra></extra>"
            ))
            
        # Format the layout of the chart
        fig.update_layout(
            xaxis=dict(title="Proportion", range=[0, 1], tickvals=[0, 0.2, 0.4, 0.6, 0.8, 1.0]),
            yaxis=dict(showticklabels=False, range=[-1, locked_R]), # Hide y-axis numbers as they just represent replicate index
            height=400,
            margin=dict(l=20, r=20, t=20, b=20)
        )
        
        # Render the plot
        st.plotly_chart(fig, use_container_width=True)
        
        # Summary statistics
        st.markdown(f"**Replicates that captured true $p$:** {np.sum(captured)} / {locked_R}")
        st.markdown(f"**Capture Rate:** <span style='color:green; font-size:1.2em;'>{capture_rate*100:.1f}%</span>", unsafe_allow_html=True)