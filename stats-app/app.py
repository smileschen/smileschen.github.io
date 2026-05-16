import streamlit as st
import numpy as np
import matplotlib.pyplot as plt

# 1. App Title and Description
st.title("Interactive Statistical Teaching App")
st.write("Welcome! This is a starter app to test our Streamlit environment.")

# 2. Add an Interactive Slider
st.sidebar.header("Simulation Settings")
sample_size = st.sidebar.slider("Select Sample Size (n):", min_value=10, max_value=1000, value=100, step=10)

# 3. Generate Random Data based on Slider Input
# We generate data from a Standard Normal Distribution
data = np.random.normal(loc=0.0, scale=1.0, size=sample_size)

# 4. Display Metrics
st.subheader("Sample Statistics")
col1, col2 = st.columns(2)
col1.metric("Sample Mean", f"{np.mean(data):.3f}")
col2.metric("Sample Std Dev", f"{np.std(data):.3f}")

# 5. Plot a Histogram
st.subheader("Data Distribution Histogram")
fig, ax = plt.subplots()
ax.hist(data, bins=20, edgecolor="black", color="skyblue")
ax.set_title(f"Histogram of Normal Distribution (n = {sample_size})")
ax.set_xlabel("Value")
ax.set_ylabel("Frequency")

# Display the plot in the Streamlit app
st.pyplot(fig)