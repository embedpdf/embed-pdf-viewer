# syntax=docker/dockerfile-upstream:master-labs
FROM emscripten/emsdk:3.1.70 AS tools

ARG DEBIAN_FRONTEND=noninteractive

ENV PATH="/emsdk/upstream/bin:${PATH}"

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
      autoconf \
      automake \
      build-essential \
      cmake \
      curl \
      git \
      libtool \
      lsb-release \
      ninja-build \
      pkg-config \
      python3 \
      rsync \
      sudo \
      subversion \
      tini \
      xz-utils \
      yasm && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && \
    apt-get install -y --no-install-recommends nodejs && \
    npm install -g pnpm@10.4.0 && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

RUN git clone https://chromium.googlesource.com/chromium/tools/depot_tools.git \
      -b main /opt/depot-tools

ENV PATH="${PATH}:/opt/depot-tools"

RUN /opt/depot-tools/ensure_bootstrap && \
    /opt/depot-tools/gclient --version

RUN curl -sSf https://sh.rustup.rs | bash -s -- -y && \
    . "$HOME/.cargo/env" && \
    cargo install --locked watchexec-cli && \
    strip "$HOME/.cargo/bin/watchexec" && \
    rm -rf "$HOME/.cargo/registry" "$HOME/.cargo/git"

ENV PATH="$HOME/.cargo/bin:${PATH}"

# gn must be the gn_version runtime-src/DEPS pins: an older gn rejects a newer
# //.gn. This stage reruns on every DEPS change, but the COPY below is keyed on
# the gn binary, so base and linux-test stay cached until gn_version moves.
FROM tools AS gn

RUN --mount=type=bind,source=runtime-src/DEPS,target=/tmp/DEPS \
    gn_version="$(DEPOT_TOOLS_UPDATE=0 gclient getdep --deps-file=/tmp/DEPS --var=gn_version)" && \
    printf '$ParanoidMode CheckPresence\n$OverrideInstallMode copy\ngn/gn/linux-amd64 %s\n' "$gn_version" | \
      /opt/depot-tools/cipd ensure -root /opt/pdfium-linux-gn -ensure-file -

FROM tools AS base

COPY --from=gn /opt/pdfium-linux-gn/gn /usr/local/bin/gn

RUN gn --version

WORKDIR /workspace

ENTRYPOINT ["/usr/bin/tini", "--"]

# Native linux-x64 PDFium tests (scripts/test-pdfium-docker.sh). Chromium's
# Linux build dependencies are installed here, in a layer keyed on the install
# script, so a test run doesn't spend minutes in apt: test-target.sh skips the
# install when its install-build-deps.py matches EMBEDPDF_BUILD_DEPS_INSTALLED_FROM.
# The apt lists stay in the image because `--quick-check` reads them to pick
# the same packages.
FROM base AS linux-test

COPY runtime-src/build/install-build-deps.py /opt/chromium-build/install-build-deps.py

RUN /opt/chromium-build/install-build-deps.py --no-prompt && \
    apt-get clean

# The first pass installs systemd-sysv, and its /sbin/init makes the script add
# 32-bit compat packages it skipped before; the second pass installs those. The
# quick check must pass here, or every test run falls back to the full install.
RUN /opt/chromium-build/install-build-deps.py --no-prompt && \
    /opt/chromium-build/install-build-deps.py --quick-check && \
    apt-get clean

ENV EMBEDPDF_BUILD_DEPS_INSTALLED_FROM=/opt/chromium-build/install-build-deps.py
