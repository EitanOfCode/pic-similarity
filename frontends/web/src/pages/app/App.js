// import 'bootstrap/dist/css/bootstrap.min.css';
import './App.css';

import React, { useState } from 'react';
import { SERVER_PORT, SERVER_URL } from '../../utils/consts';

import { API } from '../../config/GoogleVision';
import Button from 'react-bootstrap/Button';
import Card from 'react-bootstrap/Card';
import Container from 'react-bootstrap/Container';
import Row from 'react-bootstrap/Row';
import Spinner from 'react-bootstrap/Spinner';
import { auth } from '../../config/firebase';
import { average } from '../../utils/func-utils';
import axios from 'axios';
import { toImageURL } from '../../utils/app-utils';

const ImageHoverDisplayer = ({ isHovering = false, imgSrc }) => (
    <div style={{ width: 400, height: 500 }}>
        Is Hovering: {isHovering ? 'image has no disc' : <img src={imgSrc} />}
    </div>
);

const App = () => {
    const [imageDescriptions, setImageDescriptions] = useState('');
    const [results, setResults] = useState({ tfIdf: [], doc2vec: [] });
    const [searchImage, setSearchImage] = useState(undefined);
    const [displaySearchedImage, setDisplaySearchedImage] = useState(undefined);
    const [searchImageLabelAnnotions, setSearchImageLabelAnnotions] = useState(undefined);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(false);
    const [clearScreen, setClearScreen] = useState(false);
    const [imageInputRef, setImageInputRef] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loginError, setLoginError] = useState(null);
    const [loggedIn, setLoggedIn] = useState(false);
    const [hover, setHover] = useState(false);
    const [disImage, setDisImage] = useState(undefined);

    const showSearchedImage = () => {
        if (searchImageLabelAnnotions != undefined) {
            return (
                <div
                    className="raleway"
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexDirection: 'column',
                        marginTop: 50
                    }}
                >
                    <div>
                        <h1 style={{ fontSize: '3em' }}>Searched Image</h1>
                    </div>
                    <img style={{ width: '25rem' }} src={displaySearchedImage} />

                    <div>
                        <div style={{ marginTop: 20, fontSize: '1.3em' }}>
                            Descriptions: {searchImageLabelAnnotions.map(({ description }) => description).join(', ')}
                        </div>
                        <div style={{ fontSize: '1.3em' }}>
                            Average Google Confidence score:{' '}
                            {average(searchImageLabelAnnotions.map(({ score }) => score)).toFixed(3)}
                        </div>
                    </div>
                </div>
            );
        }
    };
    const onChangeFilePicker = event => {
        setSearchImage(event.target.files[0]);
        setDisplaySearchedImage(URL.createObjectURL(event.target.files[0]));
    };

    function uploadFiles(event) {
        event.stopPropagation(); // Stop stuff happening
        event.preventDefault(); // Totally stop stuff happening

        //Grab the file and asynchronously convert to base64.
        var file = searchImage;
        var reader = new FileReader();
        reader.readAsDataURL(file);
        console.log('file', file);
        console.log('reader', reader);
        reader.onloadend = processFile(file.type);
    }
    function processFile(fileType) {
        return function (event) {
            const encodedFile = event.target.result.replace(`data:${fileType};base64,`, '');

            //console.log(fromByteArray(encodedFile));
            sendFiletoCloudVision(encodedFile);
        };
    }

    const sendFiletoCloudVision = encodedFile => {
        const reqBody = {
            requests: [
                {
                    image: {
                        content: encodedFile
                    },
                    features: [
                        {
                            type: 'LABEL_DETECTION'
                        }
                    ]
                }
            ]
        };

        axios.post('https://vision.googleapis.com/v1/images:annotate?key=' + API, reqBody).then(res => {
            if (res) {
                const { labelAnnotations } = res.data.responses[0];
                console.log('Google vision results', labelAnnotations);
                setSearchImageLabelAnnotions(labelAnnotations);
                axios.post(`${SERVER_URL}/query-annotations`, labelAnnotations).then(
                    queryResults => {
                        console.log('queryResults', queryResults);
                        if (queryResults && queryResults.data) {
                            setResults({
                                tfIdf: queryResults.data.tfIdf.body.hits.hits,
                                doc2vec: queryResults.data.doc2vec.body.hits.hits
                            });
                            setError(false);
                        }
                    },
                    errpr => console.log('errr', errpr)
                );
            }

            // .post(`${SERVER_URL}/query-annotations`, [
            //     { mid: '/m/01bqvp', description: 'Sky', score: 0.9874151, topicality: 0.9874151 },
            //     { mid: '/m/01ctsf', description: 'Atmosphere', score: 0.8894614, topicality: 0.8894614 },
            //     {
            //         mid: '/m/07pw27b',
            //         description: 'Atmospheric phenomenon',
            //         score: 0.88611656,
            //         topicality: 0.88611656
            //     },
            //     { mid: '/m/01d74z', description: 'Night', score: 0.88425183, topicality: 0.88425183 },
            //     { mid: '/m/09ggk', description: 'Purple', score: 0.8638063, topicality: 0.8638063 },
            //     { mid: '/m/01d9ll', description: 'Astronomical object', score: 0.85587794, topicality: 0.85587794 },
            //     { mid: '/m/039b5', description: 'Galaxy', score: 0.8367594, topicality: 0.8367594 },
            //     { mid: '/m/0d1n2', description: 'Horizon', score: 0.7861331, topicality: 0.7861331 },
            //     { mid: '/m/06ngk', description: 'Star', score: 0.78378415, topicality: 0.78378415 },
            //     { mid: '/m/06wqb', description: 'Space', score: 0.746108, topicality: 0.746108 }
            // ])
        });
    };

    const onClickGetSimilar = () => {
        setClearScreen(false);
        setError(false);
        setLoading(true);
        const data = new FormData();
        data.append('file', searchImage);
        axios
            .post(`${SERVER_URL}/upload`, data, {})
            .then(res => {
                console.log('res', res);

                const tfIdfResults = res.data.tfIdf.body.hits.hits;
                const doc2vecResults = res.data.doc2vec.body.hits.hits;
                const {
                    data: {
                        searchedImage: {
                            body: { _source: labelAnnotations }
                        }
                    }
                } = res;

                if (tfIdfResults && tfIdfResults.length > 0 && doc2vecResults && doc2vecResults.length > 0) {
                    setError(false);
                    setResults({
                        tfIdf: tfIdfResults,
                        doc2vec: doc2vecResults
                    });
                    setImageDescriptions(
                        labelAnnotations
                            .map(annotation => {
                                return annotation.description;
                            })
                            .join(', ')
                    );
                }
                setLoading(false);
            })
            .catch(e => {
                console.error(e);
                setLoading(false);
            });
    };
    const login = (
        <div className="container">
            <div className="top"></div>
            <div className="bottom"></div>
            <div className="center">
                <h2>Please Sign In</h2>
                <input
                    type="email"
                    placeholder="email"
                    value={email}
                    onChange={event => {
                        setEmail(event.target.value);
                    }}
                />
                <input
                    type="password"
                    placeholder="password"
                    value={password}
                    onChange={event => {
                        setPassword(event.target.value);
                    }}
                />
                <button
                    onClick={() => {
                        auth.signInWithEmailAndPassword(email, password).then(
                            _ => {
                                console.log('logged in', error);
                                setLoggedIn(true);
                                setLoginError(null);
                                setEmail('');
                                setPassword('');
                            },
                            error => {
                                console.log('err', error);
                                setLoginError(error.toString());
                            }
                        );
                    }}
                >
                    Sign in
                </button>
                {loginError ? <div style={{ color: 'red', marginTop: 10 }}>{loginError}</div> : null}
            </div>
        </div>
    );
    const mainApp = (
        <Container fluid>
            <div
                style={{
                    display: 'flex',
                    alignItems: 'left',
                    flexDirection: 'colunm',
                    justifyContent: 'space-evenly',
                    marginTop: 50
                }}
            >
                <div
                    className="raleway"
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexDirection: 'column'
                    }}
                >
                    <div
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexDirection: 'column'
                        }}
                    >
                        <h1>Pic Similarity Service</h1>
                        <h2>Upload Image</h2>
                    </div>

                    <div
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexDirection: 'column',
                            paddingTop: 20
                        }}
                    >
                        <input
                            type="file"
                            accept="image/*"
                            name="file"
                            onChange={onChangeFilePicker}
                            ref={ref => setImageInputRef(ref)}
                        />
                    </div>
                    <div
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexDirection: 'row',
                            paddingTop: 20
                        }}
                    >
                        {/* <Button
                        varient="primary"
                        onClick={onClickGetSimilar}
                        type="submit"
                        disabled={!searchImage}
                        style={{ marginRight: 10 }}
                    >
                        Get Similar
                    </Button> */}

                        <Button
                            varient="primary"
                            onClick={uploadFiles}
                            type="submit"
                            disabled={!searchImage}
                            style={{ padding: 10, paddingRight: 100, paddingLeft: 100 }}
                        >
                            Search
                        </Button>
                    </div>
                </div>
                {showSearchedImage()}
            </div>
            {loading ? <Spinner animation="border" /> : null}

            {!error && !loading && results.tfIdf.length > 0 && results.doc2vec.length > 0 && !clearScreen ? (
                <Container fluid>
                    {imageDescriptions && !clearScreen ? (
                        <Card style={{ width: '18rem' }}>
                            <Card.Img variant="top" src={toImageURL(results.searchedImage._source.image_path)} />
                            <Card.Body>
                                <Card.Title>Search Image</Card.Title>
                                <Card.Text>{imageDescriptions}</Card.Text>
                            </Card.Body>
                        </Card>
                    ) : null}
                    <div
                        className="raleway"
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexDirection: 'column',
                            marginTop: 50,
                            marginBottom: 30
                        }}
                    >
                        <h1 style={{ fontSize: '3em' }}>TF-IDF Results</h1>
                    </div>

                    <div
                        className="raleway"
                        style={{
                            display: 'flex',
                            flexDirection: 'row',
                            alignItems: 'center',
                            justifyContent: 'space-evenly'
                        }}
                    >
                        {results.tfIdf.map(hit => {
                            const { image_path, labelAnnotations } = hit._source;

                            const descriptions = labelAnnotations.map(annotation => {
                                return annotation.description;
                            });
                            const descriptionString = descriptions.join(', ');
                            const url = toImageURL(image_path);
                            return (
                                <Card style={{ width: '18rem' }}>
                                    <Card.Img variant="top" src={url} />
                                    <Card.Body>
                                        <Card.Title>Score: {Math.round((hit._score - 1) * 100)}%</Card.Title>
                                        <Card.Title>Lables</Card.Title>
                                        <Card.Text>{descriptionString}</Card.Text>
                                    </Card.Body>
                                </Card>
                            );
                        })}
                    </div>
                    <div
                        className="raleway"
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexDirection: 'column',
                            marginTop: 50,
                            marginBottom: 30
                        }}
                    >
                        <h1 style={{ fontSize: '3em' }}>Doc2vec Results</h1>
                    </div>
                    <div
                        className="raleway"
                        style={{
                            display: 'flex',
                            flexDirection: 'row',
                            alignItems: 'center',
                            justifyContent: 'space-evenly'
                        }}
                    >
                        {results.doc2vec.map(hit => {
                            const { image_path, labelAnnotations } = hit._source;
                            const descriptions = labelAnnotations.map(annotation => {
                                return annotation.description;
                            });
                            const descriptionString = descriptions.join(', ');
                            const url = toImageURL(image_path);
                            return (
                                <Card style={{ width: '18rem' }}>
                                    <Card.Img variant="top" src={url} />
                                    <Card.Body>
                                        <Card.Title>Score: {Math.round((hit._score - 1) * 100)}%</Card.Title>
                                        <Card.Title>Lables</Card.Title>
                                        <Card.Text>{descriptionString}</Card.Text>
                                    </Card.Body>
                                </Card>
                            );
                        })}
                    </div>
                </Container>
            ) : null}
        </Container>
    );
    return loggedIn ? mainApp : login;
};
export default App;
