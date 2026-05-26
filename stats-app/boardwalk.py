import streamlit as st
import numpy as np
import matplotlib.pyplot as plt
import scipy.stats as stats

# Configure the Streamlit page
st.set_page_config(page_title="The Case of the Weighted Wheel", layout="wide")

# --- INITIALIZE SESSION STATE ---
if 'stage' not in st.session_state:
    st.session_state['stage'] = 0  # 0: Not started, 1: Planning, 2: Collected, 3: Omniscient

st.title("🕵️ The Case of the Weighted Wheel")
st.markdown("""
Welcome, Investigator. The 'Spin to Win' booth claims a fair 50% win rate. We suspect foul play. 
Your job is to gather evidence and make a call. But be careful: falsely accusing a fair booth is just as bad as letting a cheater get away.
""")

# --- STAGE 0: START THE GAME ---
if st.session_state['stage'] == 0:
    st.markdown("Click below to approach the booth. The universe will decide if they are running a fair game or a rigged one.")
    if st.button("Start Game", type="primary"):
        # 75% chance of cheating, 25% chance of fair
        is_cheating = np.random.choice([True, False], p=[0.75, 0.25])
        st.session_state['is_cheating'] = is_cheating
        
        if is_cheating:
            st.session_state['p_true'] = np.random.uniform(0.35, 0.45)
        else:
            st.session_state['p_true'] = 0.50
            
        st.session_state['stage'] = 1
        st.rerun()

# --- STAGE 1 & BEYOND: PLANNING AND EXPLORATION ---
if st.session_state['stage'] >= 1:
    st.header("📋 Investigation Planning")
    st.markdown("Adjust your parameters. Watch how the distribution narrows as you collect more data.")
    
    col_inputs, col_plot = st.columns([1, 2])
    
    with col_inputs:
        alpha = st.slider("Significance Level (alpha)", 0.01, 0.10, 0.05, 0.01)
        n = st.slider("Sample Size (number of spins)", 10, 500, 100, 10)
        
        # Calculations for dynamic text
        p_0 = 0.50
        se_null = np.sqrt((p_0 * (1 - p_0)) / n)
        z_crit = stats.norm.ppf(alpha) # Left tail
        p_crit = p_0 + z_crit * se_null
        critical_wins = int(np.floor(p_crit * n))
        
        st.info(f"**Field Guide:** With a sample size of {n} and a significance level of {alpha}, you will need to observe **{critical_wins} wins or fewer** to legally conclude the booth is cheating.")
        
        # Button to advance to data collection
        if st.session_state['stage'] == 1:
            if st.button("Collect Data", type="primary"):
                st.session_state['n_spins'] = n
                st.session_state['alpha'] = alpha
                st.session_state['x'] = np.random.binomial(n, st.session_state['p_true'])
                st.session_state['p_hat'] = st.session_state['x'] / n
                st.session_state['stage'] = 2
                st.rerun()

    with col_plot:
        fig, ax = plt.subplots(figsize=(8, 4))
        
        # Mathematically extend the arrays far enough so the shading and lines don't get cut off prematurely
        math_min = min(0.0, p_0 - 5*se_null)
        math_max = max(1.0, p_0 + 5*se_null)
        
        x_axis = np.linspace(math_min, math_max, 1000)
        y_null = stats.norm.pdf(x_axis, p_0, se_null)
        
        ax.plot(x_axis, y_null, label=f"Null Distribution ($p={p_0}$)", color='black')
        
        # Shade Rejection Region starting from the far left of our math boundary
        x_alpha = np.linspace(math_min, p_crit, 100)
        y_alpha = stats.norm.pdf(x_alpha, p_0, se_null)
        ax.fill_between(x_alpha, y_alpha, color='red', alpha=0.2, label=f"Rejection Region ($\\alpha={alpha}$)")
        ax.axvline(p_crit, color='red', linestyle=':', label=f"Critical Threshold ($p \leq {p_crit:.3f}$)")
        
        # Add test statistic line ONLY if data is collected
        if st.session_state['stage'] >= 2:
            p_hat = st.session_state['p_hat']
            ax.axvline(p_hat, color='blue', linestyle='--', linewidth=2, label=f"Observed $\\hat{{p}}$ = {p_hat:.3f}")
            
            # Shade p-value
            x_pval = np.linspace(math_min, p_hat, 100)
            y_pval = stats.norm.pdf(x_pval, p_0, se_null)
            ax.fill_between(x_pval, y_pval, color='blue', alpha=0.5, label="p-value Area")

        ax.set_title("Sampling Distribution & Evidence Threshold")
        ax.set_xlabel("Proportion of Wins")
        ax.set_ylabel("Density")
        
        # --- THE FIX: LOCK THE X-AXIS ---
        ax.set_xlim(0.25, 0.75) 
        
        ax.legend(loc='upper right')
        st.pyplot(fig)

st.markdown("---")

# --- STAGE 2 & BEYOND: RESULTS & MATH ---
if st.session_state['stage'] >= 2:
    st.header("🔬 Investigation Results")
    x_obs = st.session_state['x']
    n_obs = st.session_state['n_spins']
    p_hat_obs = st.session_state['p_hat']
    alpha_locked = st.session_state['alpha']
    
    se_null_locked = np.sqrt((0.50 * (1 - 0.50)) / n_obs)
    z_stat = (p_hat_obs - 0.50) / se_null_locked
    p_value = stats.norm.cdf(z_stat)
    
    col_math, col_verdict = st.columns(2)
    
    with col_math:
        st.markdown(f"You spun the wheel **{n_obs}** times and won **{x_obs}** times.")
        st.markdown(f"**Observed Win Proportion ($\\hat{{p}}$): {p_hat_obs:.3f}**")
        st.latex(rf"SE = \sqrt{{\frac{{0.5(1-0.5)}}{{{n_obs}}}}} = {se_null_locked:.4f}")
        st.latex(rf"z = \frac{{{p_hat_obs:.3f} - 0.50}}{{{se_null_locked:.4f}}} = {z_stat:.2f}")
        st.latex(rf"p\text{{-value}} = {p_value:.4f}")

    with col_verdict:
        rejected_null = p_value < alpha_locked
        st.session_state['rejected_null'] = rejected_null 
        
        if rejected_null:
            st.success("### Verdict: EVIDENCE FOUND!\n**Action: Reject the Null Hypothesis.**\nThe p-value is less than your significance level. You have enough evidence to shut this booth down for cheating.")
        else:
            st.error("### Verdict: INCONCLUSIVE.\n**Action: Fail to Reject the Null Hypothesis.**\nThe p-value is greater than your significance level. You do not have enough evidence to prove they are cheating.")
    
    if st.session_state['stage'] == 2:
        st.markdown("<br>", unsafe_allow_html=True)
        if st.button("🔮 Enter Omniscient Mode", type="primary"):
            st.session_state['stage'] = 3
            st.rerun()

# --- STAGE 3: OMNISCIENT MODE (THE TRUTH) ---
if st.session_state['stage'] == 3:
    st.markdown("---")
    st.header("👁️ Omniscient Mode: The Truth Revealed")
    
    is_cheating_truth = st.session_state['is_cheating']
    p_true = st.session_state['p_true']
    rejected = st.session_state['rejected_null']
    
    col_truth, col_analysis = st.columns(2)
    
    with col_truth:
        st.subheader("The Reality")
        if is_cheating_truth:
            st.warning(f"**The booth was CHEATING.**\nThe true probability of winning was artificially lowered to **{p_true:.3f}**.")
        else:
            st.info("**The booth was FAIR.**\nThe true probability of winning was exactly **0.50**.")
            
    with col_analysis:
        st.subheader("Performance Analysis")
        
        if is_cheating_truth and rejected:
            st.success("**Correct Conclusion (True Positive / Power)!**\nYou successfully caught a cheating booth.")
        elif is_cheating_truth and not rejected:
            st.error("**Type II Error (False Negative).**\nThe booth was cheating, but your investigation failed to detect it. They got away with it! (Try a larger sample size next time).")
        elif not is_cheating_truth and rejected:
            st.error("**Type I Error (False Positive).**\nThe booth was perfectly fair, but you shut them down anyway! Your significance level allowed this random fluke to look like cheating.")
        elif not is_cheating_truth and not rejected:
            st.success("**Correct Conclusion (True Negative)!**\nThe booth was fair, and you correctly left them alone.")
            
    if st.button("Play Again"):
        st.session_state.clear()
        st.rerun()