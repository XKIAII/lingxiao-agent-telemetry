from setuptools import setup, find_packages

setup(
    name="agent-telemetry",
    version="0.1.0",
    description="Agent 可观测性中间件 — 安全护栏 + 实时面板",
    long_description=open("README.md", encoding="utf-8").read(),
    long_description_content_type="text/markdown",
    author="凌霄",
    packages=find_packages(),
    python_requires=">=3.8",
    classifiers=[
        "Development Status :: 3 - Alpha",
        "Intended Audience :: Developers",
        "Topic :: Software Development :: Libraries",
        "Programming Language :: Python :: 3",
        "Programming Language :: Python :: 3.8",
        "Programming Language :: Python :: 3.13",
    ],
)
