FROM ubuntu:16.04

MAINTAINER Lynckia

WORKDIR /opt



# Download latest version of the code and install dependencies
RUN  apt-get update && apt-get install -y git wget curl

COPY .nvmrc package.json /opt/licode/

COPY scripts/installUbuntuDeps.sh scripts/checkNvm.sh scripts/libnice-014.patch0 /opt/licode/scripts/

WORKDIR /opt/licode/scripts

RUN ["chmod", "+x", "./installUbuntuDeps.sh"]

RUN ./installUbuntuDeps.sh --cleanup --fast

WORKDIR /opt

COPY . /opt/licode

RUN mkdir /opt/licode/.git

# Clone and install licode
WORKDIR /opt/licode/scripts

RUN ./installErizo.sh -dfeacs && \
    ./../nuve/installNuve.sh && \
    ./installBasicExample.sh

WORKDIR /opt/licode

ARG COMMIT

RUN echo $COMMIT > RELEASE
RUN date --rfc-3339='seconds' >> RELEASE
RUN cat RELEASE

WORKDIR /opt

RUN apt-get -qq update && apt-get -qq install apt-utils wget

RUN apt-get -qq install apertium
RUN apt-get -qq install apertium-en-es

ENTRYPOINT ["./licode/extras/docker/initDockerLicode.sh"]
