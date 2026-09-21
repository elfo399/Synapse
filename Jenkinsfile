pipeline {
    agent any
    options {
        skipDefaultCheckout(true)
        disableConcurrentBuilds()
        timestamps()
        timeout(time: 45, unit: 'MINUTES')
        buildDiscarder(logRotator(numToKeepStr: '20'))
    }
    triggers {
        githubPush()
    }
    stages {
        stage('Scarica main') {
            steps {
                script {
                    def revision = checkout(scm)
                    env.GIT_COMMIT = revision.GIT_COMMIT
                }
                sh 'git log -1 --format="Commit: %h %s"'
            }
        }
        stage('Compila e aggiorna Synapse') {
            steps {
                withCredentials([
                    sshUserPrivateKey(credentialsId: 'synapse-deploy-ssh', keyFileVariable: 'DEPLOY_KEY', usernameVariable: 'DEPLOY_USER'),
                    file(credentialsId: 'synapse-deploy-known-hosts', variable: 'DEPLOY_KNOWN_HOSTS')
                ]) {
                    sh '''
                        set +x
                        ssh -i "$DEPLOY_KEY" \
                            -o IdentitiesOnly=yes -o BatchMode=yes \
                            -o StrictHostKeyChecking=yes \
                            -o UserKnownHostsFile="$DEPLOY_KNOWN_HOSTS" \
                            -o ConnectTimeout=15 -o ServerAliveInterval=30 \
                            "$DEPLOY_USER@host.docker.internal" "deploy $GIT_COMMIT"
                    '''
                }
            }
        }
    }
    post {
        success { echo 'Synapse aggiornato e verificato. Database e allegati conservati nei volumi persistenti.' }
        failure { echo 'Aggiornamento non riuscito: controllare il log. Nessun volume viene eliminato dal job.' }
    }
}
